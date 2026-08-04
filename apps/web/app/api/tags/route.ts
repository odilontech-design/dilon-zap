import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const tags = await prisma.tag.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(tags);
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5"),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const name = parsed.data.name.trim();
  const existing = await prisma.tag.findUnique({ where: { tenantId_name: { tenantId: user.tenantId, name } } });
  if (existing) return NextResponse.json({ error: "já existe uma etiqueta com esse nome" }, { status: 409 });

  const tag = await prisma.tag.create({
    data: { tenantId: user.tenantId, name, color: parsed.data.color, isActive: parsed.data.isActive },
  });

  return NextResponse.json(tag);
}
