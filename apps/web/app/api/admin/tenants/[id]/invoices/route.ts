import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { nextDueDate } from "@/lib/billing";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription) return NextResponse.json({ error: "esse tenant não tem plano configurado" }, { status: 400 });

  const openInvoice = await prisma.invoice.findFirst({
    where: { tenantId: tenant.id, status: "PENDING" },
  });
  if (openInvoice) {
    return NextResponse.json({ error: "já existe uma cobrança em aberto — marque como paga antes de gerar outra" }, {
      status: 409,
    });
  }

  const invoice = await prisma.invoice.create({
    data: {
      subscriptionId: tenant.subscription.id,
      tenantId: tenant.id,
      amountCents: tenant.subscription.amountCents,
      dueDate: nextDueDate(tenant.subscription.cycleDay),
    },
  });

  await logAudit({
    actor: admin,
    action: "invoice.generate",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { invoiceId: invoice.id, amountCents: invoice.amountCents, dueDate: invoice.dueDate },
  });

  return NextResponse.json(invoice);
}
