import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";
import { prisma } from "@dilon-zap/db";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { normalizarParaBusca } from "@/lib/busca";
import { termosDaBusca, padraoSemAcento, INICIO_DE_PALAVRA } from "@/lib/busca-texto";

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
export type AchadoDaBusca = { ids: string[]; trechos: Map<string, string> };

type Escopo = { tenantId: string; setoresPermitidos: string[] | null };

const CACHE_MS = 10_000;
const LIMITE_DE_CONVERSAS = 3000;
const cache = new Map<string, { em: number; achado: AchadoDaBusca }>();

/**
 * Conversas que a busca encontra: o contato (nome, telefone, CPF/CNPJ, e-mail)
 * OU o texto de qualquer mensagem. Antes o texto só era olhado quando ninguém
 * batia no contato; a Hemoderi consulta endereço, que só existe dentro das
 * mensagens.
 *
 * Cada palavra digitada precisa aparecer, em qualquer ordem — no contato, ou
 * todas na mesma mensagem. Nas mensagens a palavra casa no INÍCIO de uma palavra
 * do texto (reclamação do André: "ibe" trazia "recebe").
 *
 * Resultado guardado por 10 s: a lista e os números das abas pedem o mesmo,
 * cada atendente consulta em laço, e mensagem que chegou agora aparecer na
 * busca 10 s depois não faz diferença.
 */
export async function buscarNoInbox(escopo: Escopo, termos: string[]): Promise<AchadoDaBusca> {
  const chave = [escopo.tenantId, escopo.setoresPermitidos?.join(",") ?? "*", ...termos.map(normalizarParaBusca)].join("\u0001");
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.achado;

  const padroes = termos.map(padraoSemAcento);

  const porContato = Prisma.join(
    termos.map((t, i) => {
      const digitos = t.replace(/\D/g, "");
      const telefone = digitos.length >= 4 || (termos.length === 1 && digitos.length > 0);
      const alternativas: Prisma.Sql[] = [Prisma.sql`ct."name" ~* ${padroes[i]}`];
      if (telefone) {
        alternativas.push(Prisma.sql`position(${digitos} in ct."waJid") > 0`);
        alternativas.push(Prisma.sql`position(${digitos} in coalesce(ct."phoneNumber", '')) > 0`);
      }
      // CPF/CNPJ guardado com ou sem pontuação.
      if (digitos.length >= 4) alternativas.push(Prisma.sql`position(${digitos} in coalesce(ct."documento", '')) > 0`);
      alternativas.push(Prisma.sql`position(${t} in coalesce(ct."documento", '')) > 0`);
      // E-mail só com pedaço que o identifique: "ibe" solto casaria com meio mundo.
      if (t.includes("@") || t.length >= 5) alternativas.push(Prisma.sql`ct."email" ~* ${padroes[i]}`);
      return Prisma.sql`(${Prisma.join(alternativas, " OR ")})`;
    }),
    " AND "
  );
  const porTexto = Prisma.join(
    padroes.map((p) => Prisma.sql`m."body" ~* ${INICIO_DE_PALAVRA + p}`),
    " AND "
  );
  const soSetores = escopo.setoresPermitidos
    ? escopo.setoresPermitidos.length
      ? Prisma.sql`AND (m."setorId" IS NULL OR m."setorId" IN (${Prisma.join(escopo.setoresPermitidos)}))`
      : Prisma.sql`AND m."setorId" IS NULL`
    : Prisma.empty;

  const [contatos, mensagens] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT cv."id" FROM "Conversation" cv JOIN "Contact" ct ON ct."id" = cv."contactId"
      WHERE cv."tenantId" = ${escopo.tenantId} AND ct."grupo" = false AND ${porContato}`,
    prisma.$queryRaw<{ id: string; trecho: string }[]>`
      SELECT x."id", x."trecho" FROM (
        SELECT DISTINCT ON (m."conversationId") m."conversationId" AS "id", cv."lastMessageAt",
          substr(m."body", greatest(1, regexp_instr(m."body", ${INICIO_DE_PALAVRA + padroes[0]}, 1, 1, 0, 'i') - 30), 140) AS "trecho"
        FROM "Message" m
        JOIN "Conversation" cv ON cv."id" = m."conversationId"
        JOIN "Contact" ct ON ct."id" = cv."contactId"
        WHERE cv."tenantId" = ${escopo.tenantId} AND ct."grupo" = false AND ${porTexto} ${soSetores}
        ORDER BY m."conversationId", m."createdAt" DESC
      ) x ORDER BY x."lastMessageAt" DESC LIMIT ${LIMITE_DE_CONVERSAS}`,
  ]);

  const trechos = new Map(mensagens.map((m) => [m.id, m.trecho.replace(/\s+/g, " ").trim()]));
  const achado: AchadoDaBusca = { ids: [...new Set([...contatos.map((c) => c.id), ...trechos.keys()])], trechos };

  if (cache.size > 200) cache.clear();
  cache.set(chave, { em: Date.now(), achado });
  return achado;
}

/**
 * Setores que quem busca pode ver, quando a empresa isola o histórico entre
 * setores (Tenant.isolarHistoricoPorSetor). null = sem restrição. A busca nas
 * mensagens obedece à mesma regra da conversa aberta: senão ela mostraria, no
 * trecho da lista, o que a tela de mensagens esconde.
 */
async function setoresDaBusca(user: CurrentUser): Promise<string[] | null> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { isolarHistoricoPorSetor: true },
  });
  if (!tenant.isolarHistoricoPorSetor || user.role === "OWNER" || user.role === "SUPERADMIN") return null;
  const meus = await prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } });
  return meus.map((m) => m.setorId).sort();
}

/** Onde a palavra aparece em cada conversa achada, pra lista mostrar; vazio sem busca. */
export async function trechosDaBusca(user: CurrentUser, params: URLSearchParams): Promise<Map<string, string>> {
  const termos = termosDaBusca(params.get("search")?.trim());
  if (!termos.length) return new Map();
  const escopo = { tenantId: user.tenantId, setoresPermitidos: await setoresDaBusca(user) };
  return (await buscarNoInbox(escopo, termos)).trechos;
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
    const escopo = { tenantId: user.tenantId, setoresPermitidos: await setoresDaBusca(user) };
    busca = [{ id: { in: (await buscarNoInbox(escopo, termos)).ids } }];
  }

  return { ...base, AND: [visibilidade, ...busca] };
}
