import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const block = await prisma.contactBlock.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!block) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.contactBlock.delete({ where: { id: block.id } });
  return NextResponse.json({ ok: true });
}
