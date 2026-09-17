import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { cancelPreapproval } from "@/lib/mercadopago";

/** POST /api/admin/tenants/[id]/subscription/mp-cancel — encerra a cobrança automática. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription?.mpPreapprovalId) {
    return NextResponse.json({ error: "esse tenant não tem cobrança automática configurada" }, { status: 400 });
  }

  await cancelPreapproval(tenant.subscription.mpPreapprovalId);

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: { mpPreapprovalStatus: "cancelled" },
  });

  await logAudit({
    actor: admin,
    action: "subscription.mp_checkout_cancelado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { preapprovalId: tenant.subscription.mpPreapprovalId },
  });

  return NextResponse.json(subscription);
}
