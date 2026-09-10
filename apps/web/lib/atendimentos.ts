import type { Prisma } from "@prisma/client";

/**
 * Ciclos de atendimento de uma conversa.
 *
 * O ciclo é fechado no momento em que a conversa é resolvida, e o início vem
 * do fim do ciclo anterior — ou da criação da conversa, no primeiro. Não
 * existe "ciclo aberto" guardado em lugar nenhum: o atendimento em curso é
 * calculado, e por isso não há como alguém esquecer de abrir um.
 */

/** Quando começou o ciclo que está fechando agora. */
export async function inicioDoCicloAtual(
  tx: Prisma.TransactionClient,
  conversationId: string,
  criadaEm: Date
) {
  const anterior = await tx.atendimento.findFirst({
    where: { conversationId },
    orderBy: { encerradoEm: "desc" },
    select: { encerradoEm: true },
  });
  return anterior?.encerradoEm ?? criadaEm;
}

/**
 * Fecha o ciclo em curso.
 *
 * Chamado de dentro da mesma operação que resolve a conversa — se a conversa
 * fecha e o ciclo não é gravado, o histórico ganha um buraco silencioso que
 * ninguém descobre até ir procurar.
 */
export async function encerrarCiclo(
  tx: Prisma.TransactionClient,
  params: {
    conversationId: string;
    criadaEm: Date;
    motivo?: string | null;
    encerradoById?: string;
    encerradoEm?: Date;
  }
) {
  const encerradoEm = params.encerradoEm ?? new Date();
  const iniciadoEm = await inicioDoCicloAtual(tx, params.conversationId, params.criadaEm);

  // Ciclo de duração negativa não deveria acontecer, mas se acontecer (relógio
  // torto, backfill fora de ordem) é melhor gravar com início igual ao fim do
  // que gravar um atendimento que terminou antes de começar.
  return tx.atendimento.create({
    data: {
      conversationId: params.conversationId,
      iniciadoEm: iniciadoEm > encerradoEm ? encerradoEm : iniciadoEm,
      encerradoEm,
      motivo: params.motivo?.trim() || null,
      encerradoById: params.encerradoById,
    },
  });
}

export type MarcadorAtendimento = {
  numero: number;
  iniciadoEm: string;
  encerradoEm: string | null;
  motivo: string | null;
  encerradoPor: string | null;
  emAndamento: boolean;
};

/**
 * A linha do tempo de atendimentos pronta pra tela, incluindo o que está
 * aberto agora.
 *
 * O atendimento em curso não está no banco: ele é "do fim do último ciclo até
 * agora". Montá-lo aqui é o que faz a conversa aberta também mostrar onde o
 * atendimento atual começou, e não só os encerrados.
 */
export function montarMarcadores(
  criadaEm: Date,
  encerrados: {
    iniciadoEm: Date;
    encerradoEm: Date;
    motivo: string | null;
    encerradoPor: { name: string } | null;
  }[],
  estaResolvida: boolean
): MarcadorAtendimento[] {
  const marcadores: MarcadorAtendimento[] = encerrados.map((a, i) => ({
    numero: i + 1,
    iniciadoEm: a.iniciadoEm.toISOString(),
    encerradoEm: a.encerradoEm.toISOString(),
    motivo: a.motivo,
    encerradoPor: a.encerradoPor?.name ?? null,
    emAndamento: false,
  }));

  if (!estaResolvida) {
    const ultimo = encerrados[encerrados.length - 1];
    marcadores.push({
      numero: marcadores.length + 1,
      iniciadoEm: (ultimo?.encerradoEm ?? criadaEm).toISOString(),
      encerradoEm: null,
      motivo: null,
      encerradoPor: null,
      emAndamento: true,
    });
  }

  return marcadores;
}
