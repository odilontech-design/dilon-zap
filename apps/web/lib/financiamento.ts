/**
 * Simulador de financiamento do vendedor (Inbox e, depois, a ficha do carro): uma ESTIMATIVA com a taxa que o
 * vendedor digita (a que o banco da loja pratica). Tabela Price (parcelas iguais). Não consulta banco, não aprova
 * crédito e não inclui IOF, tarifas nem seguro: por isso o texto que vai para o cliente diz que é estimativa.
 * Sem imports de servidor: a tela usa este arquivo.
 */

export const PRAZOS = [12, 24, 36, 48, 60] as const;
export const TAXA_MAXIMA_PCT = 10;

export type EntradaDaSimulacao = { precoCents: number; entradaCents: number; taxaMensalPct: number };
export type LinhaDaSimulacao = { meses: number; parcelaCents: number; totalPagoCents: number; jurosCents: number };
export type Simulacao = { ok: true; financiadoCents: number; linhas: LinhaDaSimulacao[] } | { ok: false; erro: string };

/** "55.000,50" ou "55000" em centavos; vazio ou lixo = 0. */
export function lerReais(texto: string): number {
  const limpo = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** "1,8" ou "1.8" em número (percentual ao mês); vazio ou lixo = NaN. */
export function lerPercentual(texto: string): number {
  const n = Number(texto.trim().replace(",", "."));
  return texto.trim() && Number.isFinite(n) ? n : NaN;
}

/** Parcela da tabela Price em centavos. Taxa zero divide o valor igualmente. */
export function parcelaPrice(financiadoCents: number, taxaMensalPct: number, meses: number): number {
  const i = taxaMensalPct / 100;
  if (i === 0) return Math.round(financiadoCents / meses);
  return Math.round((financiadoCents * i) / (1 - Math.pow(1 + i, -meses)));
}

export function simular(e: EntradaDaSimulacao, prazos: readonly number[] = PRAZOS): Simulacao {
  if (!(e.precoCents > 0)) return { ok: false, erro: "Informe o valor do carro." };
  if (e.entradaCents < 0) return { ok: false, erro: "A entrada não pode ser negativa." };
  if (e.entradaCents >= e.precoCents) return { ok: false, erro: "A entrada precisa ser menor que o valor do carro." };
  if (!Number.isFinite(e.taxaMensalPct) || e.taxaMensalPct < 0) return { ok: false, erro: "Informe a taxa de juros ao mês (a que o banco da loja pratica)." };
  if (e.taxaMensalPct > TAXA_MAXIMA_PCT) return { ok: false, erro: `Taxa acima de ${TAXA_MAXIMA_PCT}% ao mês: confira o valor digitado.` };
  const financiadoCents = e.precoCents - e.entradaCents;
  return {
    ok: true,
    financiadoCents,
    linhas: prazos.map((meses) => {
      const parcelaCents = parcelaPrice(financiadoCents, e.taxaMensalPct, meses);
      const totalPagoCents = parcelaCents * meses;
      return { meses, parcelaCents, totalPagoCents, jurosCents: totalPagoCents - financiadoCents };
    }),
  };
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O texto para o cliente: transparente sobre ser estimativa e sobre a taxa usada. */
export function textoDaSimulacao(i: { carro: string | null; precoCents: number; entradaCents: number; taxaMensalPct: number; financiadoCents: number; linhas: LinhaDaSimulacao[] }): string {
  const taxa = i.taxaMensalPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return [
    "*Simulação de financiamento* (estimativa)",
    i.carro ? i.carro : null,
    `Valor do carro: ${reais(i.precoCents)}`,
    `Entrada: ${reais(i.entradaCents)}`,
    `Valor financiado: ${reais(i.financiadoCents)}`,
    "",
    ...i.linhas.map((l) => `${l.meses}x de ${reais(l.parcelaCents)}`),
    "",
    `Taxa usada na simulação: ${taxa}% ao mês. É só uma estimativa, não é aprovação de crédito: a taxa final, o IOF, as tarifas e o seguro dependem da análise do banco e podem mudar o valor das parcelas.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
