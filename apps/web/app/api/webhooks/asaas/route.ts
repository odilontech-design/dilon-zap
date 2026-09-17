import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { deveRegistrarComoPaga } from "@/lib/asaas-webhook";

/**
 * POST /api/webhooks/asaas
 * ------------------------------------------------------------------
 * A Asaas chama esta URL a cada evento de cobrança OU de Pix Automático
 * (autorização, instrução de pagamento — ver lib/asaas.ts pro porquê de ser
 * uma API separada). O payload já vem com o objeto inteiro dentro — não
 * precisa buscar detalhe nenhum de volta na API deles.
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

  let body: {
    event?: string;
    payment?: Record<string, unknown>;
    authorization?: Record<string, unknown>;
    paymentInstruction?: Record<string, unknown>;
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true, ignored: "corpo inválido" });
  }

  if (!body?.event) return NextResponse.json({ received: true, ignored: "sem event" });
  const evento = body.event;

  try {
    if (evento.startsWith("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_") && body.authorization) {
      await tratarAutorizacao(evento, body.authorization);
    } else if (evento === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED" && body.paymentInstruction) {
      await tratarInstrucaoCriada(body.paymentInstruction);
    } else if (body.payment) {
      await tratarEventoDePagamento(evento, body.payment);
    }
    // Outros eventos (instrução agendada/recusada/cancelada, elegibilidade de
    // conta) não têm efeito nenhum daqui — a tela não mostra nada sobre eles.
  } catch (error) {
    console.error("[webhook asaas]", evento, error);
  }

  return NextResponse.json({ received: true });
}

/** Atualiza o cache de status da autorização de Pix Automático. */
async function tratarAutorizacao(evento: string, authorization: Record<string, unknown>) {
  const id = authorization.id as string | undefined;
  const status = authorization.status as string | undefined;
  if (!id || !status) return;

  await prisma.subscription.updateMany({
    where: { asaasPixAuthorizationId: id },
    data: { asaasPixAuthorizationStatus: status },
  });
}

/**
 * Chega ANTES do dinheiro em si, com o id do Payment que a Asaas já gerou
 * pra essa cobrança do ciclo — é o gancho pra saber de quem é o pagamento
 * quando o PAYMENT_RECEIVED chegar depois (ver o comentário grande em
 * lib/asaas.ts pro porquê disso ser necessário só pro Pix Automático).
 *
 * Pré-grava a fatura como PENDING; tratarEventoDePagamento completa pra PAID.
 */
async function tratarInstrucaoCriada(instrucao: Record<string, unknown>) {
  const paymentId = instrucao.paymentId as string | undefined;
  const dueDate = instrucao.dueDate as string | undefined;
  const authorizationId = (instrucao.authorization as Record<string, unknown> | undefined)?.id as string | undefined;
  if (!paymentId || !dueDate || !authorizationId) return;

  const jaExiste = await prisma.invoice.findUnique({ where: { asaasPaymentId: paymentId } });
  if (jaExiste) return;

  const subscription = await prisma.subscription.findFirst({ where: { asaasPixAuthorizationId: authorizationId } });
  if (!subscription) {
    console.error("[webhook asaas] instrução de Pix Automático sem autorização correspondente", authorizationId);
    return;
  }

  await prisma.invoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      amountCents: subscription.amountCents,
      dueDate: new Date(dueDate),
      status: "PENDING",
      asaasPaymentId: paymentId,
    },
  });
}

async function tratarEventoDePagamento(evento: string, pagamento: Record<string, unknown>) {
  const status = pagamento.status as string;
  if (!deveRegistrarComoPaga(evento, status)) return;

  const paymentId = String(pagamento.id);
  const dataPagamento = (pagamento.paymentDate as string | null) ?? (pagamento.dueDate as string);

  // Mesmo critério do Mercado Pago: a constraint @unique em asaasPaymentId é
  // quem garante isto de verdade se dois webhooks chegarem juntos; esta
  // consulta só evita uma tentativa óbvia de duplicar.
  const existente = await prisma.invoice.findUnique({ where: { asaasPaymentId: paymentId } });
  if (existente) {
    // Já processada — evento repetido (a Asaas reenvia até dar 200).
    if (existente.status === "PAID") return;
    // Pré-gravada como PENDING pela instrução de Pix Automático: só falta
    // confirmar que o dinheiro entrou. O status da autorização em si já é
    // atualizado pelo evento de AUTHORIZATION_ACTIVATED, separado deste.
    await prisma.invoice.update({
      where: { id: existente.id },
      data: { status: "PAID", paidAt: new Date(dataPagamento) },
    });
    return;
  }

  // Caminho normal (cartão/boleto/PIX avulso via Subscription de cartão): o
  // próprio pagamento carrega o id da Subscription.
  const subscriptionId = pagamento.subscription as string | null;
  let subscription = subscriptionId
    ? await prisma.subscription.findFirst({ where: { asaasSubscriptionId: subscriptionId } })
    : null;

  // Primeira cobrança do Pix Automático: não veio de uma instrução (essas só
  // existem pros ciclos seguintes) nem carrega `subscription` (isso é campo
  // do mundo das Subscriptions de cartão). O que sobra pra achar de quem é:
  // o Customer — que é o mesmo Customer usado pra criar a autorização.
  if (!subscription) {
    const customerId = pagamento.customer as string | undefined;
    if (customerId) {
      const candidatas = await prisma.subscription.findMany({
        where: { asaasCustomerId: customerId, asaasPixAuthorizationId: { not: null } },
      });
      // Só usa se achar EXATAMENTE uma — duas candidatas seria adivinhação,
      // e adivinhar errado credita a mensalidade de um cliente a outro.
      if (candidatas.length === 1) subscription = candidatas[0];
    }
  }

  if (!subscription) {
    console.error("[webhook asaas] pagamento sem subscription/autorização correspondente", paymentId);
    return;
  }

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

  // O status ACTIVE do cartão é a prova de que a primeira cobrança passou;
  // do lado do Pix Automático quem faz esse papel é o próprio evento de
  // AUTHORIZATION_ACTIVATED, então só mexe aqui quando resolvemos por
  // asaasSubscriptionId (o caminho do cartão).
  if (subscriptionId) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { asaasSubscriptionStatus: "ACTIVE" },
    });
  }
}
