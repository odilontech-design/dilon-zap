import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  amountCents: z.number().int().min(0),
  cycleDay: z.number().int().min(1).max(28),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELED"]).default("ACTIVE"),
  notes: z.string().max(500).optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });

  const subscription = await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, ...parsed.data },
    update: parsed.data,
  });

  await logAudit({
    actor: admin,
    action: "subscription.update",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: parsed.data,
  });

  return NextResponse.json(subscription);
}
