import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await requireUser();

  const blocks = await prisma.contactBlock.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(blocks);
}

const bodySchema = z.object({
  waJid: z.string().min(3),
  reason: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const block = await prisma.contactBlock.upsert({
    where: { tenantId_waJid: { tenantId: user.tenantId, waJid: parsed.data.waJid } },
    create: { tenantId: user.tenantId, waJid: parsed.data.waJid, reason: parsed.data.reason },
    update: { reason: parsed.data.reason },
  });

  await logAudit({ actor: user, action: "contact.block", metadata: { waJid: parsed.data.waJid, reason: parsed.data.reason } });

  return NextResponse.json(block);
}
