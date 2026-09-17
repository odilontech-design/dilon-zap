import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { cancelAsaasSubscription } from "@/lib/asaas";

/** POST /api/admin/tenants/[id]/subscription/asaas-cancel — encerra a cobrança automática (Asaas). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription?.asaasSubscriptionId) {
    return NextResponse.json({ error: "esse tenant não tem cobrança automática (Asaas) configurada" }, { status: 400 });
  }

  await cancelAsaasSubscription(tenant.subscription.asaasSubscriptionId);

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: { asaasSubscriptionStatus: "INACTIVE" },
  });

  await logAudit({
    actor: admin,
    action: "subscription.asaas_checkout_cancelado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { subscriptionId: tenant.subscription.asaasSubscriptionId },
  });

  return NextResponse.json(subscription);
}
