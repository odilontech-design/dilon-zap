import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { cancelPixAuthorization } from "@/lib/asaas";

/** POST /api/admin/tenants/[id]/subscription/asaas-pix-cancel — encerra a cobrança automática (Pix). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription?.asaasPixAuthorizationId) {
    return NextResponse.json({ error: "esse tenant não tem cobrança automática (Pix) configurada" }, { status: 400 });
  }

  await cancelPixAuthorization(tenant.subscription.asaasPixAuthorizationId);

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: { asaasPixAuthorizationStatus: "CANCELLED" },
  });

  await logAudit({
    actor: admin,
    action: "subscription.asaas_pix_checkout_cancelado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { authorizationId: tenant.subscription.asaasPixAuthorizationId },
  });

  return NextResponse.json(subscription);
}
