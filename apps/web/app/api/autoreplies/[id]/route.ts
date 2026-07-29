import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const rule = await prisma.autoReply.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.autoReply.delete({ where: { id: rule.id } });
  return NextResponse.json({ ok: true });
}
