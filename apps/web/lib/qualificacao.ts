import type { Plano } from "./plano-regras";

/**
 * Qualificação do autocadastro: ramo e tamanho da equipe.
 *
 * Existe porque o lead do anúncio chega querendo o teste grátis, não uma
 * entrevista. Perguntar "qual o ramo? quantas pessoas atendem?" no WhatsApp
 * travava a conversa; as mesmas perguntas como dois campos de escolha no
 * cadastro custam um toque cada e chegam no painel da Dilon Tech já com o
 * plano sugerido.
 *
 * Puro e compartilhado: o formulário monta as opções daqui, a rota valida
 * contra a mesma lista e o painel de aprovação traduz o código de volta.
 */

export const RAMOS = [
  "Beleza e estética",
  "Varejo e comércio",
  "Saúde e clínicas",
  "Turismo",
  "Alimentação",
  "Serviços",
  "Outro",
] as const;
export type Ramo = (typeof RAMOS)[number];

export const FAIXAS_ATENDENTES = [
  { valor: "SO_EU", rotulo: "Só eu" },
  { valor: "2_3", rotulo: "2 ou 3 pessoas" },
  { valor: "4_8", rotulo: "4 a 8 pessoas" },
  { valor: "9_MAIS", rotulo: "9 ou mais" },
] as const;
export type FaixaAtendentes = (typeof FAIXAS_ATENDENTES)[number]["valor"];

export const VALORES_FAIXA = FAIXAS_ATENDENTES.map((f) => f.valor) as [FaixaAtendentes, ...FaixaAtendentes[]];

export function ehRamo(v: unknown): v is Ramo {
  return typeof v === "string" && (RAMOS as readonly string[]).includes(v);
}

export function ehFaixa(v: unknown): v is FaixaAtendentes {
  return typeof v === "string" && (VALORES_FAIXA as readonly string[]).includes(v);
}

export function rotuloFaixa(v: string | null | undefined): string | null {
  return FAIXAS_ATENDENTES.find((f) => f.valor === v)?.rotulo ?? null;
}

/**
 * Plano que comporta a equipe informada, pelo teto de atendentes de cada um
 * (Essencial 3, Profissional 8, Escala sem teto — ver plano-regras).
 *
 * É só sugestão pré-selecionada na aprovação: quem decide é a Dilon Tech, e
 * sem faixa informada (cadastros antigos) o padrão continua sendo o Essencial.
 */
export function planoSugerido(faixa: string | null | undefined): Plano {
  if (faixa === "4_8") return "PROFISSIONAL";
  if (faixa === "9_MAIS") return "ESCALA";
  return "ESSENCIAL";
}
