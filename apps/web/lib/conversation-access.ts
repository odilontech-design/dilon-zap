import type { Prisma } from "@prisma/client";
import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * O que este usuário pode enxergar em Conversation.
 *
 * AGENT só vê conversa sem dono ou atribuída a si mesmo — evita, por exemplo,
 * um comercial abordar alguém que já está em atendimento com o financeiro.
 * OWNER e SUPERADMIN continuam vendo tudo do tenant.
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
  if (user.role !== "AGENT") return {};

  const membros = await prisma.setorMembro.findMany({
    where: { userId: user.id },
    select: { setorId: true },
  });
  const setorIds = membros.map((m) => m.setorId);

  return {
    OR: [
      // Minha, esteja em que setor estiver — inclusive num que eu não componho
      // mais. Perder de vista uma conversa que é sua seria pior que o excesso.
      { assignedToId: user.id },
      // Fila geral: sem dono e sem setor. É o comportamento de antes dos setores.
      { assignedToId: null, setorId: null },
      // Fila dos meus setores.
      ...(setorIds.length > 0 ? [{ assignedToId: null, setorId: { in: setorIds } }] : []),
    ],
  };
}
