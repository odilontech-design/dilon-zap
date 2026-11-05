/**
 * Comissão por faixa de venda (pedido da Believe, 05/11/2026).
 *
 * A consultora soma o que vendeu no período e a FAIXA ATINGIDA vale para o
 * total inteiro, não só para o que passa do degrau: quem vendeu R$ 18.594,09
 * passou dos 17 mil, então recebe 1,5% sobre os R$ 18.594,09. Abaixo de 12 mil
 * não há comissão.
 *
 * Tudo em centavos inteiros. A taxa fica em pontos-base (1,3% = 130) para que a
 * conta seja inteira também: 1,3 em ponto flutuante dá 0,30000000000000004 em
 * algum produto e o centavo some ou sobra.
 */

export type Faixa = { minCents: number; taxaBp: number };

/** Da menor para a maior. As faixas combinadas com a Believe. */
export const FAIXAS_PADRAO: readonly Faixa[] = [
  { minCents: 12_000_00, taxaBp: 130 },
  { minCents: 17_000_00, taxaBp: 150 },
  { minCents: 20_000_00, taxaBp: 180 },
  { minCents: 25_000_00, taxaBp: 200 },
];

export type ResultadoComissao = {
  vendidoCents: number;
  /** Faixa atingida, ou null se ainda não chegou na primeira. */
  faixa: Faixa | null;
  taxaBp: number;
  comissaoCents: number;
  /** Próximo degrau e quanto falta para chegar nele; null na última faixa. */
  proxima: { minCents: number; taxaBp: number; faltaCents: number } | null;
};

export function calcularComissao(vendidoCents: number, faixas: readonly Faixa[] = FAIXAS_PADRAO): ResultadoComissao {
  const ordenadas = [...faixas].sort((a, b) => a.minCents - b.minCents);
  const total = Math.max(0, Math.trunc(vendidoCents));
  let faixa: Faixa | null = null;
  for (const f of ordenadas) if (total >= f.minCents) faixa = f;
  const proximaFaixa = ordenadas.find((f) => f.minCents > total) ?? null;
  const taxaBp = faixa?.taxaBp ?? 0;
  return {
    vendidoCents: total,
    faixa,
    taxaBp,
    // Arredonda para o centavo mais próximo: é o que a calculadora de quem confere faz.
    comissaoCents: Math.round((total * taxaBp) / 10_000),
    proxima: proximaFaixa
      ? { minCents: proximaFaixa.minCents, taxaBp: proximaFaixa.taxaBp, faltaCents: proximaFaixa.minCents - total }
      : null,
  };
}

export type PedidoParaComissao = {
  totalCents: number;
  status: string;
  createdById: string | null;
  fechadoEm: Date | null;
};

export type LinhaComissao = ResultadoComissao & {
  /** null = pedidos sem consultora registrada. */
  usuarioId: string | null;
  pedidos: number;
};

/**
 * Soma os pedidos FECHADOS no período por quem os criou e aplica a faixa de
 * cada pessoa. Cancelado, rascunho e aguardando o financeiro não entram.
 * O período é pela data do fechamento: é quando a venda se confirma.
 */
export function comissaoPorConsultora(
  pedidos: readonly PedidoParaComissao[],
  periodo: { desde?: Date; ate?: Date } = {},
  faixas: readonly Faixa[] = FAIXAS_PADRAO
): LinhaComissao[] {
  const acc = new Map<string | null, { cents: number; n: number }>();
  for (const p of pedidos) {
    if (p.status !== "FECHADO" || !p.fechadoEm) continue;
    if (periodo.desde && p.fechadoEm < periodo.desde) continue;
    if (periodo.ate && p.fechadoEm > periodo.ate) continue;
    const a = acc.get(p.createdById) ?? { cents: 0, n: 0 };
    a.cents += p.totalCents;
    a.n += 1;
    acc.set(p.createdById, a);
  }
  return [...acc.entries()]
    .map(([usuarioId, a]) => ({ usuarioId, pedidos: a.n, ...calcularComissao(a.cents, faixas) }))
    .sort((x, y) => y.vendidoCents - x.vendidoCents);
}
