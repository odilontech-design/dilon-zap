// Decisão do webhook da Asaas. Puro. Rodar com:
// npx tsx apps/web/lib/asaas-webhook.test-manual.ts
import { deveRegistrarComoPaga } from "./asaas-webhook";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${obtido}, esperado ${esperado})`}`);
}

checa("PIX recebido: PAYMENT_RECEIVED + RECEIVED vira fatura paga", deveRegistrarComoPaga("PAYMENT_RECEIVED", "RECEIVED"), true);
checa("cartão aprovado: PAYMENT_CONFIRMED + CONFIRMED vira fatura paga", deveRegistrarComoPaga("PAYMENT_CONFIRMED", "CONFIRMED"), true);
checa("dinheiro em mãos: PAYMENT_RECEIVED + RECEIVED_IN_CASH vira fatura paga", deveRegistrarComoPaga("PAYMENT_RECEIVED", "RECEIVED_IN_CASH"), true);

checa("cobrança só criada, ainda não paga: não vira fatura", deveRegistrarComoPaga("PAYMENT_CREATED", "PENDING"), false);
checa("vencida: não vira fatura paga", deveRegistrarComoPaga("PAYMENT_OVERDUE", "OVERDUE"), false);
checa("estornada: não vira fatura paga", deveRegistrarComoPaga("PAYMENT_REFUNDED", "REFUNDED"), false);
checa("cobrança apagada: não vira fatura paga", deveRegistrarComoPaga("PAYMENT_DELETED", "PENDING"), false);
checa(
  "evento de recebimento mas status ainda não bate (corrida entre eventos): não vira",
  deveRegistrarComoPaga("PAYMENT_RECEIVED", "PENDING"),
  false
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
