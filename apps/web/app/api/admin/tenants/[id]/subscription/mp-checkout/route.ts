import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { createSubscriptionCheckout, getPreapproval } from "@/lib/mercadopago";

const bodySchema = z.object({
  billingEmail: z.string().email("e-mail inválido"),
});

/**
 * GET /api/admin/tenants/[id]/subscription/mp-checkout
 * Reexibe o link de autorização de uma assinatura já criada, sem gerar outra
 * — pra quando o superadmin fechou a tela e precisa reenviar o mesmo link.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant?.subscription?.mpPreapprovalId) {
    return NextResponse.json({ error: "esse tenant não tem cobrança automática configurada" }, { status: 404 });
  }

  const preapproval = await getPreapproval(tenant.subscription.mpPreapprovalId);
  return NextResponse.json({ initPoint: preapproval.init_point, status: preapproval.status });
}

/**
 * POST /api/admin/tenants/[id]/subscription/mp-checkout
 * Gera (ou substitui) o link de autorização de cobrança automática. O
 * superadmin envia esse link pro cliente (WhatsApp, e-mail — o Mercado Pago
 * não avisa ninguém sozinho); o cliente abre uma vez e cadastra o cartão.
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
  if (tenant.subscription.mpPreapprovalStatus === "authorized") {
    return NextResponse.json({ error: "já existe uma cobrança automática ativa — cancele antes de gerar outra" }, {
      status: 409,
    });
  }

  const checkout = await createSubscriptionCheckout({
    subscriptionId: tenant.subscription.id,
    tenantName: tenant.name,
    amountCents: tenant.subscription.amountCents,
    payerEmail: parsed.data.billingEmail,
  });

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      billingEmail: parsed.data.billingEmail,
      mpPreapprovalId: checkout.id,
      mpPreapprovalStatus: checkout.status,
    },
  });

  await logAudit({
    actor: admin,
    action: "subscription.mp_checkout_criado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { preapprovalId: checkout.id, billingEmail: parsed.data.billingEmail },
  });

  return NextResponse.json({ initPoint: checkout.initPoint, subscription });
}
