import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { createAsaasSubscriptionCheckout, getLatestCheckoutUrl, AsaasError } from "@/lib/asaas";

const bodySchema = z.object({
  billingEmail: z.string().email("e-mail inválido"),
  // CPF (11 dígitos) ou CNPJ (14), com ou sem pontuação — a Asaas exige isto
  // pra cadastrar o Customer, diferente do Mercado Pago que só pede e-mail.
  billingDocument: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11 || v.length === 14, "CPF ou CNPJ inválido"),
});

/**
 * GET /api/admin/tenants/[id]/subscription/asaas-checkout
 * Reexibe o link da cobrança em aberto de uma assinatura já criada, sem gerar
 * outra — mesmo papel do equivalente do Mercado Pago.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant?.subscription?.asaasSubscriptionId) {
    return NextResponse.json({ error: "esse tenant não tem cobrança automática (Asaas) configurada" }, { status: 404 });
  }

  const checkoutUrl = await getLatestCheckoutUrl(tenant.subscription.asaasSubscriptionId);
  if (!checkoutUrl) {
    return NextResponse.json({ error: "nenhuma cobrança em aberto encontrada na Asaas" }, { status: 404 });
  }
  return NextResponse.json({ checkoutUrl });
}

/**
 * POST /api/admin/tenants/[id]/subscription/asaas-checkout
 * Cria (ou substitui) a assinatura na Asaas e devolve o link da primeira
 * cobrança — o superadmin manda esse link pro cliente cadastrar o cartão.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription) {
    return NextResponse.json({ error: "configure o plano (valor e vencimento) antes de gerar a cobrança automática" }, {
      status: 400,
    });
  }
  if (tenant.subscription.asaasSubscriptionStatus === "ACTIVE") {
    return NextResponse.json({ error: "já existe uma cobrança automática (Asaas) ativa — cancele antes de gerar outra" }, {
      status: 409,
    });
  }

  let checkout;
  try {
    checkout = await createAsaasSubscriptionCheckout({
      tenantName: tenant.name,
      amountCents: tenant.subscription.amountCents,
      cycleDay: tenant.subscription.cycleDay,
      payerEmail: parsed.data.billingEmail,
      payerDocument: parsed.data.billingDocument,
    });
  } catch (error) {
    // O motivo da Asaas (ex: valor mínimo de R$5 pra cartão) é o que ajuda o
    // superadmin a corrigir — um 500 genérico não diria nada disso.
    const motivo = error instanceof AsaasError ? error.motivo : "erro inesperado ao falar com a Asaas";
    return NextResponse.json({ error: motivo }, { status: 502 });
  }

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      billingEmail: parsed.data.billingEmail,
      billingDocument: parsed.data.billingDocument,
      asaasCustomerId: checkout.customerId,
      asaasSubscriptionId: checkout.id,
      asaasSubscriptionStatus: checkout.status,
    },
  });

  await logAudit({
    actor: admin,
    action: "subscription.asaas_checkout_criado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { subscriptionId: checkout.id, billingEmail: parsed.data.billingEmail },
  });

  return NextResponse.json({ checkoutUrl: checkout.checkoutUrl, subscription });
}
