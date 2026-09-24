import type { Prisma } from "@prisma/client";
import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * Só quem administra a conta enxerga tudo do tenant sem filtro. Separado da
 * função async pra dar pra testar sem banco — foi justamente listar "!==
 * AGENT" em vez desta lista que deixou o FINANCEIRO ver o inbox inteiro da
 * Guttierres em vez de só o setor dele.
 */
export function temVisaoLivreDoTenant(role: CurrentUser["role"]): boolean {
  return role === "OWNER" || role === "SUPERADMIN";
}

/**
 * Os ramos de visibilidade de um AGENT. Puro, pra ter teste — é a regra que
 * decide quem enxerga o atendimento de quem, e errar aqui vaza conversa de
 * cliente entre setores.
 *
 * `filaGeralRestrita` tira do alcance do atendente a conversa sem responsável
 * E sem setor. Ver Tenant.restringirFilaGeral no schema.
 */
export function ramosDeVisibilidade({
  userId,
  setorIds,
  filaGeralRestrita,
  vePendenciaFinanceira = false,
}: {
  userId: string;
  setorIds: string[];
  filaGeralRestrita: boolean;
  /**
   * Só pro FINANCEIRO: alcança a conversa de QUALQUER contato com pedido
   * fechado e não pago, mesmo que ela seja de outro atendente ou de outro
   * setor. Cobrar é uma tarefa que atravessa setor — sem este ramo, o
   * financeiro clicava em "Abrir conversa" a partir de A receber e batia
   * num 404, porque a conversa do cliente já era do Departamento Pessoal ou
   * de quem sabe qual atendente (foi o caso relatado pela Guttierres).
   * Mandar mensagem aqui NÃO transfere a conversa — ela continua do dono
   * original, só ganha uma mensagem de cobrança no meio.
   */
  vePendenciaFinanceira?: boolean;
}): Prisma.ConversationWhereInput[] {
  return [
    // Minha, esteja em que setor estiver — inclusive num que eu não componho
    // mais. Perder de vista uma conversa que é sua seria pior que o excesso.
    { assignedToId: userId },
    // Fila geral: sem dono e sem setor. É o comportamento de antes dos setores,
    // e some pra quem restringe a fila geral ao Responsável.
    ...(filaGeralRestrita ? [] : [{ assignedToId: null, setorId: null }]),
    // Fila dos meus setores.
    ...(setorIds.length > 0 ? [{ assignedToId: null, setorId: { in: setorIds } }] : []),
    // Grupo é da equipe inteira, sempre: não tem responsável nem setor, e
    // ninguém "assume" um grupo. Sem este ramo a atendente abriria a tela
    // de Grupos e receberia 404 ao responder.
    { contact: { grupo: true } },
    ...(vePendenciaFinanceira
      ? [{ contact: { orders: { some: { status: "FECHADO" as const, pago: false } } } }]
      : []),
  ];
}

/**
 * O que este usuário pode enxergar em Conversation.
 *
 * AGENT só vê conversa sem dono ou atribuída a si mesmo — evita, por exemplo,
 * um comercial abordar alguém que já está em atendimento com o financeiro.
 * FINANCEIRO segue a mesma regra, e além dela também alcança qualquer
 * contato com pedido pendente (ver vePendenciaFinanceira em
 * ramosDeVisibilidade) — cobrar atravessa setor de propósito. OWNER e
 * SUPERADMIN continuam vendo tudo do tenant.
 *
 * Setor entra como um terceiro caso, e não como detalhe: encaminhar pro setor
 * deixa assignedToId nulo de propósito, então sem tratá-lo aqui a fila do
 * Fiscal cairia no ramo "sem dono" e apareceria pro Departamento Pessoal
 * inteiro — o oposto do que dividir por setor quer dizer.
 *
 * É assíncrona porque precisa saber de quais setores a pessoa faz parte, e
 * essa informação NÃO pode vir da sessão: o JWT só é reemitido no login, e
 * tirar alguém de um setor precisa valer na hora, não no dia seguinte. Para
 * OWNER e SUPERADMIN a função retorna antes de qualquer consulta.
 */
export async function conversationVisibilityWhere(
  user: CurrentUser
): Promise<Prisma.ConversationWhereInput> {
  if (temVisaoLivreDoTenant(user.role)) return {};

  const [membros, tenant] = await Promise.all([
    prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } }),
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { restringirFilaGeral: true },
    }),
  ]);

  return {
    OR: ramosDeVisibilidade({
      userId: user.id,
      setorIds: membros.map((m) => m.setorId),
      // Tenant sumido não deveria acontecer; se acontecer, o lado seguro é
      // mostrar de menos, não de mais.
      filaGeralRestrita: tenant?.restringirFilaGeral ?? true,
      vePendenciaFinanceira: user.role === "FINANCEIRO",
    }),
  };
}
