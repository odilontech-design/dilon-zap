import type { Expansao } from "./tipologia";

/**
 * Precificação de item de orçamento.
 *
 * A conta é a mesma que o vendedor faz hoje na calculadora — custo, margem,
 * acréscimo — e o resultado é devolvido ABERTO (cada parcela nomeada) porque
 * a tela mostra a decomposição na hora da venda. Vendedor que não enxerga o
 * custo não sabe até onde pode negociar, e é aí que a serralheria vende no
 * prejuízo sem perceber.
 *
 * Tudo em centavos inteiros. Preço de venda em float acumula erro de
 * arredondamento entre item, orçamento e contas a receber — e aí a soma das
 * parcelas não bate com o total do contrato.
 */

export type RegrasPreco = {
  /** Markup sobre o custo, em %. 100 = dobra o custo (é o padrão do setor). */
  margemLucroPercent: number;
  /** Mão de obra por m² de esquadria. */
  maoDeObraPorM2Centavos: number;
  /** Alternativa/complemento: % sobre o custo de material. Soma com a de m². */
  maoDeObraPercentSobreCusto: number;
  /**
   * Perda de alumínio (retalho que sobra da barra e não vira peça). Entra no
   * custo porque a barra é comprada inteira: ignorar isso é a diferença
   * silenciosa entre a margem do sistema e a do extrato bancário.
   */
  perdaAluminioPercent: number;
  /** Imposto sobre a venda (Simples Nacional, na prática). */
  impostoPercent: number;
};

export const REGRAS_PADRAO: RegrasPreco = {
  margemLucroPercent: 100,
  maoDeObraPorM2Centavos: 0,
  maoDeObraPercentSobreCusto: 0,
  perdaAluminioPercent: 8,
  impostoPercent: 0,
};

export type AjustesItem = {
  /** Sobrescreve a margem da empresa neste item (a tela deixa mexer). */
  margemLucroPercent?: number | null;
  acrescimoCentavos?: number;
  descontoCentavos?: number;
  /** Custo adicional já pronto: contramarco, instalação especial, frete do item. */
  adicionaisCentavos?: number;
};

export type PrecoItem = {
  custoAluminioCentavos: number;
  perdaAluminioCentavos: number;
  custoVidroCentavos: number;
  custoFerragemCentavos: number;
  maoDeObraCentavos: number;
  adicionaisCentavos: number;
  /** Soma de tudo que sai do bolso da empresa. */
  custoTotalCentavos: number;
  margemLucroPercent: number;
  lucroCentavos: number;
  subtotalCentavos: number;
  acrescimoCentavos: number;
  descontoCentavos: number;
  impostoCentavos: number;
  totalCentavos: number;
  /** Margem real depois de acréscimo/desconto/imposto — a que importa. */
  margemEfetivaPercent: number;
};

export function precificarItem(expansao: Expansao, regras: RegrasPreco, ajustes: AjustesItem = {}): PrecoItem {
  const perdaAluminioCentavos = Math.round(expansao.custoAluminioCentavos * (regras.perdaAluminioPercent / 100));

  const custoMaterial =
    expansao.custoAluminioCentavos + perdaAluminioCentavos + expansao.custoVidroCentavos + expansao.custoFerragemCentavos;

  const maoDeObraCentavos =
    Math.round(expansao.areaTotalM2 * regras.maoDeObraPorM2Centavos) +
    Math.round(custoMaterial * (regras.maoDeObraPercentSobreCusto / 100));

  const adicionaisCentavos = Math.max(0, Math.round(ajustes.adicionaisCentavos ?? 0));
  const custoTotalCentavos = custoMaterial + maoDeObraCentavos + adicionaisCentavos;

  const margemLucroPercent = ajustes.margemLucroPercent ?? regras.margemLucroPercent;
  const lucroCentavos = Math.round(custoTotalCentavos * (margemLucroPercent / 100));
  const subtotalCentavos = custoTotalCentavos + lucroCentavos;

  const acrescimoCentavos = Math.max(0, Math.round(ajustes.acrescimoCentavos ?? 0));
  const descontoCentavos = Math.max(0, Math.round(ajustes.descontoCentavos ?? 0));

  const baseImposto = Math.max(0, subtotalCentavos + acrescimoCentavos - descontoCentavos);
  // Imposto POR FORA: o preço mostrado ao cliente já inclui o tributo, e a
  // margem não é comida por ele. Embutir por dentro esconde o custo do
  // vendedor, que é justamente o que este sistema tenta evitar.
  const impostoCentavos = Math.round(baseImposto * (regras.impostoPercent / 100));
  const totalCentavos = baseImposto + impostoCentavos;

  const lucroLiquido = totalCentavos - custoTotalCentavos - impostoCentavos;

  return {
    custoAluminioCentavos: expansao.custoAluminioCentavos,
    perdaAluminioCentavos,
    custoVidroCentavos: expansao.custoVidroCentavos,
    custoFerragemCentavos: expansao.custoFerragemCentavos,
    maoDeObraCentavos,
    adicionaisCentavos,
    custoTotalCentavos,
    margemLucroPercent,
    lucroCentavos,
    subtotalCentavos,
    acrescimoCentavos,
    descontoCentavos,
    impostoCentavos,
    totalCentavos,
    margemEfetivaPercent: totalCentavos > 0 ? Number(((lucroLiquido / totalCentavos) * 100).toFixed(2)) : 0,
  };
}

export type TotaisOrcamento = {
  custoCentavos: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  freteCentavos: number;
  totalCentavos: number;
  lucroCentavos: number;
  margemEfetivaPercent: number;
};

/**
 * Fecha o orçamento. O desconto de cabeçalho é aplicado sobre a soma dos
 * itens (e não rateado item a item) porque é assim que o cliente enxerga:
 * "me dá 5% no total". O impacto na margem aparece em `margemEfetivaPercent`
 * — é o número que impede o "5% de sempre" virar prejuízo.
 */
export function totalizarOrcamento(
  itens: Array<{ totalCentavos: number; custoTotalCentavos: number }>,
  opcoes: { descontoPercent?: number; descontoCentavos?: number; freteCentavos?: number } = {},
): TotaisOrcamento {
  const subtotalCentavos = itens.reduce((a, i) => a + i.totalCentavos, 0);
  const custoCentavos = itens.reduce((a, i) => a + i.custoTotalCentavos, 0);

  const descontoPercentual = Math.round(subtotalCentavos * (Math.max(0, opcoes.descontoPercent ?? 0) / 100));
  const descontoCentavos = Math.min(subtotalCentavos, descontoPercentual + Math.max(0, opcoes.descontoCentavos ?? 0));
  const freteCentavos = Math.max(0, opcoes.freteCentavos ?? 0);

  const totalCentavos = subtotalCentavos - descontoCentavos + freteCentavos;
  const lucroCentavos = totalCentavos - custoCentavos;

  return {
    custoCentavos,
    subtotalCentavos,
    descontoCentavos,
    freteCentavos,
    totalCentavos,
    lucroCentavos,
    margemEfetivaPercent: totalCentavos > 0 ? Number(((lucroCentavos / totalCentavos) * 100).toFixed(2)) : 0,
  };
}
