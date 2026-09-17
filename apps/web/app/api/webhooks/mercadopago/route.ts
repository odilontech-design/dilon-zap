import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { getPreapproval, getAuthorizedPayment } from "@/lib/mercadopago";

/**
 * POST /api/webhooks/mercadopago
 * ------------------------------------------------------------------
 * O Mercado Pago chama esta URL sempre que uma assinatura (PreApproval) muda
 * de status ou cobra uma parcela. Dois tipos de evento importam aqui:
 *
 *  - subscription_preapproval: o status da assinatura mudou (o cliente
 *    autorizou, pausou, cancelou...). Atualiza o cache em Subscription.
 *  - subscription_authorized_payment: uma cobrança do ciclo foi processada.
 *    Se aprovada, isso é a mensalidade — cria a Invoice já paga, sem
 *    ninguém do time precisar gerar/marcar nada manualmente.
 *
 * Sempre responde 200 mesmo quando ignora o evento (tipo desconhecido, id
 * não encontrado): devolver erro faz o Mercado Pago reenviar pra sempre um
 * evento que nunca vai passar a fazer sentido.
 */
export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // corpo vazio ou não-JSON — ver se veio por query string (formato antigo)
  }

  const type = body?.type ?? req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("topic");
  const dataId = body?.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? req.nextUrl.searchParams.get("id");

  if (!type || !dataId) {
    return NextResponse.json({ received: true, ignored: "sem type/data.id" });
  }

  try {
    if (type === "subscription_preapproval") {
      await handlePreapprovalUpdate(String(dataId));
    } else if (type === "subscription_authorized_payment") {
      await handleAuthorizedPayment(String(dataId));
    }
    // outros tipos (payment, plan, point_integration_wh...) não têm o que fazer aqui
  } catch (error) {
    // Loga mas ainda responde 200: um erro nosso (ex: subscription apagada)
    // não deveria virar um reenvio infinito do lado do Mercado Pago.
    console.error("[webhook mercadopago]", type, dataId, error);
  }

  return NextResponse.json({ received: true });
}

async function handlePreapprovalUpdate(preapprovalId: string) {
  const preapproval = await getPreapproval(preapprovalId);

  // external_reference é o Subscription.id, gravado na criação do link
  const subscriptionId = preapproval.external_reference;
  if (!subscriptionId) return;

  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      mpPreapprovalId: preapproval.id,
      mpPreapprovalStatus: preapproval.status,
    },
  });
}

async function handleAuthorizedPayment(authorizedPaymentId: string) {
  const payment = await getAuthorizedPayment(authorizedPaymentId);

  if (payment.status !== "approved") {
    // Cartão recusado, pendente etc. — não gera fatura paga; o Mercado Pago
    // já cuida sozinho das retentativas. Nada pra fazer do nosso lado agora.
    return;
  }

  // A constraint @unique em mpPaymentId é quem garante isto de verdade se dois
  // webhooks chegarem ao mesmo tempo; esta consulta só evita uma tentativa
  // óbvia de duplicar (o Mercado Pago reenvia o mesmo evento até dar 200).
  const existing = await prisma.invoice.findUnique({ where: { mpPaymentId: String(payment.id) } });
  if (existing) return;

  const subscription = await prisma.subscription.findFirst({ where: { mpPreapprovalId: payment.preapproval_id } });
  if (!subscription) {
    console.error("[webhook mercadopago] payment sem subscription correspondente", payment.preapproval_id);
    return;
  }

  await prisma.invoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      amountCents: Math.round(payment.transaction_amount * 100),
      dueDate: new Date(payment.date_created),
      status: "PAID",
      paidAt: new Date(payment.date_created),
      mpPaymentId: String(payment.id),
    },
  });
}
