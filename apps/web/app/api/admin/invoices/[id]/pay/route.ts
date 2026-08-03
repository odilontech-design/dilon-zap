import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const invoice = await prisma.invoice.findUnique({ where: { id: params.id }, include: { tenant: true } });
  if (!invoice) return NextResponse.json({ error: "fatura não encontrada" }, { status: 404 });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  await logAudit({
    actor: admin,
    action: "invoice.mark_paid",
    targetTenantId: invoice.tenantId,
    targetTenantName: invoice.tenant.name,
    metadata: { invoiceId: invoice.id, amountCents: invoice.amountCents },
  });

  return NextResponse.json(updated);
}
