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

/**
 * Atualiza o cache de status da autorização de Pix Automático.
 *
 * ACTIVATED é também o gatilho da PRIMEIRA fatura: a Asaas só ativa a
 * autorização depois que o primeiro pagamento (o do QR imediato) é
 * concluído — é a própria documentação deles que garante isso ("a
 * autorização é ativada após a conclusão do primeiro pagamento"). Achado
 * testando: esse primeiro pagamento NÃO chega com `payment.subscription`
 * preenchido nem é precedido de PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED
 * (isso só existe pros ciclos seguintes) — e tentar achar de quem é olhando
 * só o `customer` do pagamento é perigoso: QUALQUER cobrança pro mesmo
 * Customer (um teste de saldo, uma venda avulsa) acabaria creditada como
 * mensalidade paga. Por isso a primeira fatura nasce AQUI, a partir do
 * evento de ativação em si — que só existe quando o primeiro pagamento
 * realmente aconteceu — e não tentando casar um pagamento solto.
 */
async function tratarAutorizacao(evento: string, authorization: Record<string, unknown>) {
  const id = authorization.id as string | undefined;
  const status = authorization.status as string | undefined;
  if (!id || !status) return;

  const subscription = await prisma.subscription.findFirst({ where: { asaasPixAuthorizationId: id } });
  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { asaasPixAuthorizationStatus: status },
  });

  if (status !== "ACTIVE") return;

  // Idempotência: sem um asaasPaymentId pra essa primeira fatura (a Asaas não
  // devolve o id do pagamento imediato em lugar nenhum do payload da
  // autorização), o jeito de não duplicar se o evento chegar de novo é
  // perguntar se essa assinatura já tem alguma fatura paga.
  const jaTemFaturaPaga = await prisma.invoice.findFirst({
    where: { subscriptionId: subscription.id, status: "PAID" },
  });
  if (jaTemFaturaPaga) return;

  await prisma.invoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      amountCents: subscription.amountCents,
      dueDate: new Date(),
      status: "PAID",
      paidAt: new Date(),
    },
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
  // próprio pagamento carrega o id da Subscription. De propósito NÃO existe
  // um terceiro caminho tentando achar a assinatura pelo `customer` do
  // pagamento — qualquer cobrança pro mesmo Customer bateria aqui (um teste
  // de saldo, uma venda avulsa), e creditar errado é pior que não creditar:
  // a primeira fatura do Pix Automático nasce em tratarAutorizacao, no
  // evento de ativação, não aqui.
  const subscriptionId = pagamento.subscription as string | null;
  const subscription = subscriptionId
    ? await prisma.subscription.findFirst({ where: { asaasSubscriptionId: subscriptionId } })
    : null;

  if (!subscription) {
    console.error("[webhook asaas] pagamento sem subscription correspondente", paymentId);
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

  // Chegou até aqui só pelo caminho do cartão (asaasSubscriptionId) — o Pix
  // Automático nunca passa por este ponto do código (ver os comentários
  // acima). ACTIVE é a prova de que a primeira cobrança do cartão passou.
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { asaasSubscriptionStatus: "ACTIVE" },
  });
}
