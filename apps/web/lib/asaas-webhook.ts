/**
 * Decisão pura do webhook da Asaas — puro, sem banco, pra ter teste. A parte
 * com banco (achar a Subscription, checar duplicata) fica na rota.
 *
 * A Asaas manda um evento por mudança (`event`) e o pagamento inteiro dentro
 * do payload (`payment`), diferente do Mercado Pago que só manda o id e a
 * gente busca os detalhes depois. Aqui não tem o que buscar — o corpo já vem
 * completo.
 */

/**
 * Vira fatura PAGA só nos eventos de recebimento confirmado. PAYMENT_CREATED
 * e PAYMENT_UPDATED chegam bem antes de qualquer dinheiro trocar de mão —
 * gravar aí criaria uma fatura "paga" de mentira. PAYMENT_OVERDUE,
 * PAYMENT_DELETED etc. também não são recebimento.
 *
 * RECEIVED e CONFIRMED contam os dois: RECEIVED é PIX/boleto liquidado,
 * CONFIRMED é cartão aprovado mas ainda não repassado — pro que interessa
 * aqui (o cliente pagou, a mensalidade está em dia) os dois valem o mesmo.
 */
export function deveRegistrarComoPaga(evento: string, statusDoPagamento: string): boolean {
  const eventosDeRecebimento = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
  const statusDeRecebimento = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
  return eventosDeRecebimento.has(evento) && statusDeRecebimento.has(statusDoPagamento);
}
