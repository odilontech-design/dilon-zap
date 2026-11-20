/**
 * Linha de crédito do contato (Believe, 20/11).
 *
 * Puro, sem banco: recebe o limite e o que o cliente já deve (a pendência,
 * calculada das parcelas em A receber — ver lib/contas-receber) e diz quanto
 * resta e se uma nova venda a prazo passa do limite.
 *
 * O "usado" nunca é gravado. Se fosse, ia divergir do A receber no primeiro
 * recebimento que alguém esquecesse de refletir — a mesma regra do saldo do
 * pedido: grava-se o dinheiro que entrou, o resto se calcula.
 */

export type SituacaoDoCredito = {
  limiteCents: number;
  /** Parcelas em aberto do cliente (vencidas e a vencer). */
  usadoCents: number;
  /** O que ainda cabe no limite. Nunca negativo. */
  disponivelCents: number;
  /** Parte do usado que já venceu. */
  vencidoCents: number;
  /** Quanto o limite está comprometido, em %, de 0 a 100 (para a barra). */
  percentualUsado: number;
};

/**
 * null quando o contato não tem limite — quem chama decide o que isso
 * significa (hoje: vale o bloqueio antigo de venda a prazo para quem deve).
 */
export function situacaoDoCredito(
  limiteCents: number | null | undefined,
  pendencia: { saldoCents: number; vencidoCents: number } | null | undefined
): SituacaoDoCredito | null {
  if (limiteCents == null) return null;
  const usadoCents = Math.max(0, pendencia?.saldoCents ?? 0);
  return {
    limiteCents,
    usadoCents,
    disponivelCents: Math.max(0, limiteCents - usadoCents),
    vencidoCents: Math.max(0, pendencia?.vencidoCents ?? 0),
    percentualUsado: limiteCents > 0 ? Math.min(100, Math.round((usadoCents / limiteCents) * 100)) : usadoCents > 0 ? 100 : 0,
  };
}

/**
 * O que uma venda a prazo consome do limite: o total, menos a entrada que já
 * entrou na hora. Entrada ainda por receber continua sendo parcela em aberto,
 * então conta.
 */
export function valorQueUsaCredito(totalCents: number, entradaRecebidaCents = 0): number {
  return Math.max(0, totalCents - Math.max(0, entradaRecebidaCents));
}

/** Quanto a nova venda passa do que ainda cabe. 0 = cabe. */
export function excedenteDoCredito(credito: SituacaoDoCredito, vendaCents: number): number {
  return Math.max(0, vendaCents - credito.disponivelCents);
}

/**
 * O que as telas recebem: a situação do crédito, com limite e disponível nulos
 * quando o contato não tem limite (o usado aparece do mesmo jeito — é a dívida
 * dele, tenha ou não limite).
 */
export type ResumoDoCredito = {
  limiteCents: number | null;
  usadoCents: number;
  disponivelCents: number | null;
  vencidoCents: number;
  percentualUsado: number;
};

export function resumoDoCredito(
  limiteCents: number | null | undefined,
  pendencia: { saldoCents: number; vencidoCents: number } | null | undefined
): ResumoDoCredito {
  const s = situacaoDoCredito(limiteCents, pendencia);
  if (s) return s;
  return {
    limiteCents: null,
    usadoCents: Math.max(0, pendencia?.saldoCents ?? 0),
    disponivelCents: null,
    vencidoCents: Math.max(0, pendencia?.vencidoCents ?? 0),
    percentualUsado: 0,
  };
}
