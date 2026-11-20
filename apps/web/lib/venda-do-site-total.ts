/**
 * A conta da venda da loja online, separada do resto para poder ser testada sem banco: itens + frete − desconto,
 * com o mesmo limite do pedido (calcularTotais em lib/orders.ts): o desconto nunca passa do subtotal.
 */
export function totalDaVenda(v: {
  itens: { precoUnitCents: number; quantidade: number }[];
  freteCents: number;
  descontoCents: number;
}) {
  const subtotalCents = v.itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0) + (v.freteCents > 0 ? v.freteCents : 0);
  const descontoCents = Math.min(Math.max(v.descontoCents, 0), subtotalCents);
  return { subtotalCents, descontoCents, totalCents: subtotalCents - descontoCents };
}
