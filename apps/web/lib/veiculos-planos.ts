/**
 * Os planos da vertical de revenda: o que cada um inclui e os limites.
 * Puro, sem banco: é a tabela comercial da página dilontech.com.br/veiculos
 * (docs/landing-page-veiculos.md) em forma de código, com teste em
 * veiculos-planos.test-manual.ts. Mudou o preço ou o limite lá, muda aqui.
 *
 * Plano nulo = empresa sem plano de tabela (contrato sob medida, teste
 * interno, quem ligou o recurso antes dos planos): sem limites. Mesma regra de
 * "sem assinatura = tudo" do plano-regras: falhar para o lado fechado travaria
 * quem já opera.
 */

export type PlanoVeiculos = "GARAGEM" | "REVENDA" | "REVENDA_MAIS";

export const PLANOS_VEICULOS: Record<
  PlanoVeiculos,
  { nome: string; mensalCents: number; carrosNoPatio: number; catalogoMeta: boolean; multiNumero: boolean }
> = {
  GARAGEM: { nome: "Garagem", mensalCents: 39_700, carrosNoPatio: 30, catalogoMeta: false, multiNumero: false },
  REVENDA: { nome: "Revenda", mensalCents: 59_700, carrosNoPatio: 70, catalogoMeta: true, multiNumero: false },
  REVENDA_MAIS: { nome: "Revenda+", mensalCents: 89_700, carrosNoPatio: 150, catalogoMeta: true, multiNumero: true },
};

/** O adicional do Vendedor IA: teto de leads atendidos no mês e preço. */
export const PACOTES_VENDEDOR_IA = [
  { leads: 300, mensalCents: 49_700 },
  { leads: 1000, mensalCents: 99_700 },
] as const;

export function limiteDeCarros(plano: PlanoVeiculos | null): number | null {
  return plano ? PLANOS_VEICULOS[plano].carrosNoPatio : null;
}

/** Quantos carros ainda cabem no pátio. null = sem limite. */
export function vagasNoPatio(plano: PlanoVeiculos | null, noPatio: number): number | null {
  const limite = limiteDeCarros(plano);
  return limite === null ? null : Math.max(0, limite - noPatio);
}

export function temCatalogoMeta(plano: PlanoVeiculos | null): boolean {
  return plano ? PLANOS_VEICULOS[plano].catalogoMeta : true;
}

/** A mensagem de quando o pátio do plano está cheio. */
export function mensagemPatioCheio(plano: PlanoVeiculos, noPatio: number): string {
  const p = PLANOS_VEICULOS[plano];
  return `o plano ${p.nome} permite até ${p.carrosNoPatio} carros no estoque (hoje: ${noPatio}). Dê saída num carro ou fale com a Dilon Tech para mudar de plano`;
}

/**
 * Mais de um número de WhatsApp vem no Revenda+. Entra só para quem tem o
 * recurso de veículos valendo e o plano certo; uma exceção explícita no
 * Super Admin (ligado ou desligado) sempre vence.
 */
export function ganhaMultiNumero(plano: PlanoVeiculos | null, temVeiculos: boolean, excecaoMultiNumero: boolean | null): boolean {
  if (excecaoMultiNumero !== null) return false; // a exceção já foi aplicada por quem chamou
  return temVeiculos && !!plano && PLANOS_VEICULOS[plano].multiNumero;
}

/** O limite de leads que vale para a IA: o menor entre o da loja e o contratado. */
export function limiteEfetivoDeLeads(daLoja: number, contratados: number | null): number {
  return contratados === null ? daLoja : Math.min(daLoja, contratados);
}
