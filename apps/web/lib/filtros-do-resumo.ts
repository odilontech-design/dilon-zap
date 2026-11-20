/**
 * Quais filtros da lista valem para os cartões do topo do A receber e do A
 * pagar (Vencido, Vence hoje, A vencer, Em aberto). Puro, para teste.
 *
 * Os cartões seguem os filtros da lista: antes mostravam o total da empresa
 * inteira ao lado de uma lista filtrada (Dilon Tech, 12/11: lista de novembro
 * com R$ 1.294 e "A vencer" com R$ 12.940, as dez parcelas de cada assinatura).
 *
 * Duas exceções, porque os cartões são sempre sobre o que está EM ABERTO:
 *  - o status escolhido na lista não entra (o cartão é das pendentes);
 *  - o período por data de PAGAMENTO não entra: parcela em aberto não tem
 *    pagamento, e com ele valendo os cartões zerariam.
 */
export function filtrosDoResumo<F extends { desde?: Date; ate?: Date; tipoData?: "vencimento" | "pagamento" }>(
  filtros: F
): Omit<F, "desde" | "ate" | "tipoData"> & { desde?: Date; ate?: Date; tipoData: "vencimento"; status: ["PENDENTE"] } {
  const porVencimento = (filtros.tipoData ?? "vencimento") === "vencimento";
  return {
    ...filtros,
    desde: porVencimento ? filtros.desde : undefined,
    ate: porVencimento ? filtros.ate : undefined,
    tipoData: "vencimento",
    status: ["PENDENTE"],
  };
}
