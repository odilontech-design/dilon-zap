import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const stages = await prisma.stage.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { position: "asc" },
  });

  return NextResponse.json(stages);
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5"),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const name = parsed.data.name.trim();
  const existing = await prisma.stage.findUnique({ where: { tenantId_name: { tenantId: user.tenantId, name } } });
  if (existing) return NextResponse.json({ error: "já existe uma etapa com esse nome" }, { status: 409 });

  // Nasce no fim da fila de colunas — o dono reordena depois se quiser.
  const last = await prisma.stage.findFirst({ where: { tenantId: user.tenantId }, orderBy: { position: "desc" } });

  const stage = await prisma.stage.create({
    data: { tenantId: user.tenantId, name, color: parsed.data.color, position: (last?.position ?? -1) + 1 },
  });

  return NextResponse.json(stage);
}
