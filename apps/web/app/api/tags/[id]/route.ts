import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5").optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tag = await prisma.tag.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!tag) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = parsed.data.name?.trim();
  if (name && name !== tag.name) {
    const clash = await prisma.tag.findUnique({ where: { tenantId_name: { tenantId: user.tenantId, name } } });
    if (clash) return NextResponse.json({ error: "já existe uma etiqueta com esse nome" }, { status: 409 });
  }

  const updated = await prisma.tag.update({
    where: { id: tag.id },
    data: { name, color: parsed.data.color, isActive: parsed.data.isActive },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const tag = await prisma.tag.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!tag) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.tag.delete({ where: { id: tag.id } });
  return NextResponse.json({ ok: true });
}
