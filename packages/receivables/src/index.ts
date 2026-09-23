/**
 * Contas a receber: a matemática de data e dinheiro, sem banco.
 *
 * Fica num pacote à parte porque tanto o web (mostra a tela e o selo "⏰
 * Hoje") quanto o worker (dispara o aviso pro financeiro) precisam decidir
 * exatamente o mesmo dia pra exatamente o mesmo pedido — se cada app tivesse
 * sua própria cópia, um bug de sincronização faria a tela dizer "hoje" num
 * dia em que o push já não avisa mais, ou vice-versa.
 */

/** Quanto ainda falta receber deste pedido, em centavos. */
export function saldoDoPedido(totalCents: number, pagamentos: { valorCents: number }[]) {
  const recebido = pagamentos.reduce((s, p) => s + p.valorCents, 0);
  return totalCents - recebido;
}

/** Faixas de atraso. O que interessa numa lista de recebíveis é há quanto tempo. */
export type Faixa = "vencido" | "vence_hoje" | "a_vencer" | "sem_prazo";

function diaUTC(d: Date) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function faixaDeVencimento(vencimento: Date | null, agora = new Date()): Faixa {
  if (!vencimento) return "sem_prazo";

  // Compara DIA, não instante: um pedido que vence hoje às 9h não está
  // vencido às 10h. Quem combinou "dia 15" quis dizer o dia inteiro.
  const diff = diaUTC(vencimento) - diaUTC(agora);

  if (diff < 0) return "vencido";
  if (diff === 0) return "vence_hoje";
  return "a_vencer";
}

export function diasDeAtraso(vencimento: Date, agora = new Date()) {
  return Math.max(0, Math.round((diaUTC(agora) - diaUTC(vencimento)) / 86_400_000));
}

/**
 * A régua do acompanhamento interno: em quais dias, contados a partir do
 * vencimento, o financeiro é avisado que precisa dar atenção a este pedido.
 *
 * 2 dias antes (lembrete gentil), no dia (vence hoje) e daí em diante a cada
 * 7 dias enquanto continuar sem pagar — sem teto, porque isto é um empurrão
 * pra GENTE DA CASA agir, não uma mensagem pro cliente: não existe risco de
 * incomodar demais ou de parecer cobrança agressiva.
 */
export function precisaLembrarHoje(vencimento: Date, agora = new Date()): boolean {
  const diffDias = Math.round((diaUTC(agora) - diaUTC(vencimento)) / 86_400_000);

  if (diffDias === -2) return true; // 2 dias antes de vencer
  if (diffDias === 0) return true; // no dia
  if (diffDias > 0 && diffDias % 7 === 0) return true; // a cada 7 dias vencido
  return false;
}

/** Mesma data-calendário (ignora hora) — usado pra não avisar duas vezes no mesmo dia. */
export function mesmoDiaCalendario(a: Date, b: Date): boolean {
  return diaUTC(a) === diaUTC(b);
}
