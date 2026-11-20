/**
 * Medição da janela de 24 horas do WhatsApp, por cliente.
 *
 * Na API oficial da Meta, responder em até 24 horas a uma mensagem do cliente não custa; a loja que escreve primeiro, ou
 * depois de 24 horas sem resposta, precisa de um modelo aprovado e paga por mensagem. Aqui classificamos cada mensagem
 * ENVIADA pelo que existia antes dela na conversa:
 *   - dentro:    o cliente escreveu nas 24 horas anteriores (grátis na API oficial);
 *   - reabertura: o cliente já escreveu antes, mas há mais de 24 horas (exigiria modelo);
 *   - sem_previa: nenhuma mensagem do cliente antes (a loja abriu a conversa; exigiria modelo).
 * É a medição do que hoje sai pela conexão não oficial. Não altera nada.
 */

export type LinhaDaJanela = {
  tenantId: string;
  nome: string;
  slug: string;
  enviadas: number;
  dentro: number;
  reabertura: number;
  semPrevia: number;
  picoPorHora: number;
  p95PorHora: number;
  picoForaPorHora: number;
  p95ForaPorHora: number;
  numeros: number;
  conectados: number;
};

export const DIAS_PERMITIDOS = [7, 30, 60] as const;

/** Preços de referência (US$ por mensagem, Brasil) e cotação: aproximados, editáveis na tela. Confira a tabela da Meta. */
export const PRECOS_PADRAO = { utilidadeUsd: 0.0068, marketingUsd: 0.0625, cotacao: 5.5 };

export const fora = (l: Pick<LinhaDaJanela, "reabertura" | "semPrevia">) => l.reabertura + l.semPrevia;

export function percentualFora(l: Pick<LinhaDaJanela, "enviadas" | "reabertura" | "semPrevia">): number {
  return l.enviadas > 0 ? Math.round((1000 * (l.reabertura + l.semPrevia)) / l.enviadas) / 10 : 0;
}

/** O custo estimado do que sairia fora da janela: o piso (tudo utilidade) e o teto (tudo marketing). */
export function estimarCusto(mensagensFora: number, p = PRECOS_PADRAO) {
  const piso = mensagensFora * p.utilidadeUsd;
  const teto = mensagensFora * p.marketingUsd;
  return { pisoUsd: piso, tetoUsd: teto, pisoBrl: piso * p.cotacao, tetoBrl: teto * p.cotacao };
}

const arredondarPara = (n: number, passo: number) => Math.ceil(n / passo) * passo;

/**
 * Teto de envios por hora, por número, sugerido a partir do que o cliente já faz. Não é para barrar o atendimento normal:
 *   - total: 30% acima do p95 das horas movimentadas, nunca abaixo de 40, arredondado de 10 em 10;
 *   - fora da janela (a loja iniciando a conversa): 50% acima do p95, entre 10 e 40, arredondado de 5 em 5. É o que mais
 *     gera denúncia, por isso o teto é bem mais apertado que o total.
 */
export function sugerirTetos(l: Pick<LinhaDaJanela, "p95PorHora" | "p95ForaPorHora">) {
  return {
    totalPorHora: arredondarPara(Math.max(40, l.p95PorHora * 1.3), 10),
    foraPorHora: Math.min(40, Math.max(10, arredondarPara(l.p95ForaPorHora * 1.5, 5))),
  };
}

