/**
 * Detalhe dos WhatsApps que o site mandou (aba Site). A régua do site envia pela porta /api/integracao/mensagens
 * com uma referência no formato `believe-<tipo>-<número>-<evento>-<carimbo>`, por exemplo
 * `believe-pedido-19-pago-1794709439239`. É por essa referência que a mensagem é reconhecida como "do site" e
 * rotulada. Referência fora do padrão não quebra: aparece como "Mensagem do site".
 */

// Os eventos de lib/regua.ts do site da Believe.
const EVENTOS: Record<string, string> = {
  pago: "Pagamento confirmado",
  separacao: "Em separação",
  enviado: "Enviado / pronto para retirada",
  entregue: "Pedido entregue",
  cancelado: "Pedido cancelado",
  reembolsado: "Pedido reembolsado",
  lembrete_1: "Lembrete de pagamento (1 h)",
  lembrete_2: "Lembrete de pagamento (24 h)",
};

/** `believe-pedido-19-pago` (envio normal) ou `believe-pedido-19-pago-1794709439239` (reenvio pelo admin). */
export function rotuloDaReferencia(ref: string | null): { tipo: string; pedido: string | null } {
  const m = /^[a-z0-9]+-([a-z0-9]+)-(\d+)-([a-z0-9_]+?)(-\d{10,})?$/i.exec(ref ?? "");
  if (!m) return { tipo: "Mensagem do site", pedido: null };
  const evento = m[3].toLowerCase();
  const tipo = EVENTOS[evento] ?? evento.replace(/_/g, " ");
  return { tipo: m[4] ? `${tipo} (reenvio)` : tipo, pedido: m[2] };
}

/** Limites do período em UTC, a partir de datas no relógio de Brasília (UTC−3): de 00:00 até 24:00 (exclusivo). */
export function limitesDoPeriodo(de: string, ate: string): { inicio: Date; fim: Date } {
  const inicio = new Date(`${de}T03:00:00.000Z`);
  const fim = new Date(`${ate}T03:00:00.000Z`);
  fim.setUTCDate(fim.getUTCDate() + 1);
  return { inicio, fim };
}
