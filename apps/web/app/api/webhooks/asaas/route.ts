import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { deveRegistrarComoPaga } from "@/lib/asaas-webhook";

/**
 * POST /api/webhooks/asaas
 * ------------------------------------------------------------------
 * A Asaas chama esta URL a cada evento de cobrança (criada, recebida,
 * vencida...). Diferente do Mercado Pago, o payload já vem com o pagamento
 * inteiro dentro — não precisa buscar detalhe nenhum de volta na API deles.
 *
 * Autenticação: a Asaas manda de volta, em todo webhook, o mesmo valor
 * cadastrado em Integrações > Webhooks > Token de autenticação, no header
 * `asaas-access-token`. Sem token configurado (ASAAS_WEBHOOK_TOKEN vazio),
 * a rota recusa por segurança — melhor a Asaas reenviar pra sempre um evento
 * legítimo que ninguém configurou do que aceitar qualquer POST sem dono.
 *
 * Sempre responde 200 quando o evento é só ignorado (tipo que não interessa,
 * assinatura não encontrada): devolver erro faz a Asaas reenviar pra sempre
 * um evento que nunca vai passar a fazer sentido — mesmo critério do webhook
 * do Mercado Pago.
 */
export async function POST(req: NextRequest) {
  const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const tokenRecebido = req.headers.get("asaas-access-token");
  if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let body: { event?: string; payment?: Record<string, unknown> } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true, ignored: "corpo inválido" });
  }

  const evento = body?.event;
  const pagamento = body?.payment;
  if (!evento || !pagamento) {
    return NextResponse.json({ received: true, ignored: "sem event/payment" });
  }

  try {
    await tratarEventoDePagamento(evento, pagamento);
  } catch (error) {
    console.error("[webhook asaas]", evento, pagamento.id, error);
  }

  return NextResponse.json({ received: true });
}

async function tratarEventoDePagamento(evento: string, pagamento: Record<string, unknown>) {
  const subscriptionId = pagamento.subscription as string | null;
  const status = pagamento.status as string;

  if (!deveRegistrarComoPaga(evento, status)) return;

  const paymentId = String(pagamento.id);
  // Mesmo critério do Mercado Pago: a constraint @unique em asaasPaymentId é
  // quem garante isto de verdade se dois webhooks chegarem juntos; esta
  // consulta só evita uma tentativa óbvia de duplicar.
  const existente = await prisma.invoice.findUnique({ where: { asaasPaymentId: paymentId } });
  if (existente) return;

  if (!subscriptionId) return;
  const subscription = await prisma.subscription.findFirst({ where: { asaasSubscriptionId: subscriptionId } });
  if (!subscription) {
    console.error("[webhook asaas] pagamento sem subscription correspondente", subscriptionId);
    return;
  }

  const dataPagamento = (pagamento.paymentDate as string | null) ?? (pagamento.dueDate as string);

  await prisma.invoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      amountCents: Math.round(Number(pagamento.value) * 100),
      dueDate: new Date(pagamento.dueDate as string),
      status: "PAID",
      paidAt: new Date(dataPagamento),
      asaasPaymentId: paymentId,
    },
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { asaasSubscriptionStatus: "ACTIVE" },
  });
}
