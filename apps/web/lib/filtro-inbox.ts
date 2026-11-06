import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";
import { prisma } from "@dilon-zap/db";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

/**
 * O filtro do Inbox (busca, etiqueta, atendente, setor, só não lidas) num
 * lugar só — a lista de conversas e os números das abas usam este mesmo
 * filtro. Antes cada um montava o seu, e o número da aba contava a empresa
 * toda enquanto a lista mostrava só a atendente escolhida: não batia
 * (pedido da Dilon Tech, 13/10).
 *
 * Não inclui o status: a lista filtra pela aba aberta, e as abas contam as
 * três de uma vez.
 */
/**
 * Palavras da busca. A pontuação some e as iniciais soltas ("T." em "Marcelo T.
 * Affonso") não contam: quem digita o nome completo acha o contato salvo só
 * com o primeiro e o último nome. No máximo 6 palavras, para a consulta não
 * crescer sem limite.
 */
export function termosDaBusca(busca: string | undefined): string[] {
  if (!busca) return [];
  const palavras = busca
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length > 1 || /\d/.test(w));
  const unicas = [...new Set(palavras)].slice(0, 6);
  return unicas.length ? unicas : [busca.trim()];
}

/**
 * Quem a busca identifica: nome, telefone, CPF/CNPJ ou e-mail do contato.
 * Cada palavra digitada precisa aparecer em algum desses, em qualquer ordem.
 */
function porIdentidade(termos: string[]): Prisma.ConversationWhereInput[] {
  return termos.map((t) => {
    const digitos = t.replace(/\D/g, "");
    const telefone = digitos.length >= 4 || (termos.length === 1 && digitos.length > 0);
    return {
      OR: [
        { contact: { name: { contains: t, mode: "insensitive" as const } } },
        ...(telefone ? [{ contact: { waJid: { contains: digitos } } }, { contact: { phoneNumber: { contains: digitos } } }] : []),
        // CPF/CNPJ guardado com ou sem pontuação.
        ...(digitos.length >= 4 ? [{ contact: { documento: { contains: digitos } } }] : []),
        { contact: { documento: { contains: t } } },
        // E-mail só com pedaço que o identifique: "ibe" solto casaria com meio mundo.
        ...(t.includes("@") || t.length >= 5 ? [{ contact: { email: { contains: t, mode: "insensitive" as const } } }] : []),
      ],
    };
  });
}

export async function filtroDoInbox(user: CurrentUser, params: URLSearchParams): Promise<Prisma.ConversationWhereInput> {
  const search = params.get("search")?.trim();
  const tag = params.get("tag")?.trim();
  const assignedToId = params.get("assignedToId")?.trim();
  const setorId = params.get("setorId")?.trim();
  const unreadOnly = params.get("unreadOnly") === "1";
  const termos = termosDaBusca(search);

  const base: Prisma.ConversationWhereInput = {
    tenantId: user.tenantId,
    // Grupo tem tela própria e fica fora do Inbox — ver Contact.grupo.
    contact: { grupo: false },
    ...(tag ? { tags: { has: tag } } : {}),
    // "sem" = ninguém assumiu ainda (com as conversas abertas a todos, é como
    // se acha o que está esperando dono).
    ...(assignedToId ? (assignedToId === "sem" ? { assignedToId: null } : { assignedToId }) : {}),
    ...(setorId ? (setorId === "sem" ? { setorId: null } : { setorId }) : {}),
    ...(unreadOnly ? { messages: { some: { direction: "INBOUND", readAt: null } } } : {}),
  };
  const visibilidade = await conversationVisibilityWhere(user, { listagem: true });

  let busca: Prisma.ConversationWhereInput[] = [];
  if (termos.length) {
    // Busca em duas etapas (reclamação do André: "Odonto Ibe" trazia conversas
    // sem relação). 1) Quem tem o que foi digitado no nome, telefone, CPF ou
    // e-mail: se houver alguém, a lista é só essa gente. 2) Só se ninguém bater,
    // procura a frase exata dentro das mensagens. Antes cada palavra podia
    // aparecer numa mensagem diferente, e "ibe" casa com "recebe", "escreve"...
    const identidade = porIdentidade(termos);
    const achou = await prisma.conversation.findFirst({
      where: { ...base, AND: [visibilidade, ...identidade] },
      select: { id: true },
    });
    busca = achou
      ? identidade
      : [{ messages: { some: { body: { contains: termos.join(" "), mode: "insensitive" as const } } } }];
  }

  return { ...base, AND: [visibilidade, ...busca] };
}
