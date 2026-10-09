import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5").optional(),
  probabilidade: z.number().int().min(0).max(100).optional(),
  move: z.enum(["up", "down"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera as etapas" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const stage = await prisma.stage.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = parsed.data.name?.trim();
  if (name && name !== stage.name && stage.funilId) {
    // Único por funil, não por empresa.
    const clash = await prisma.stage.findUnique({ where: { funilId_name: { funilId: stage.funilId, name } } });
    if (clash) return NextResponse.json({ error: "já existe uma etapa com esse nome neste funil" }, { status: 409 });
  }

  // Reordenar troca de posição com a coluna vizinha DO MESMO FUNIL em vez de
  // recalcular tudo — simples e nunca deixa duas colunas com a mesma posição.
  if (parsed.data.move) {
    const goingUp = parsed.data.move === "up";
    const neighbor = await prisma.stage.findFirst({
      where: {
        tenantId: user.tenantId,
        funilId: stage.funilId,
        position: goingUp ? { lt: stage.position } : { gt: stage.position },
      },
      orderBy: { position: goingUp ? "desc" : "asc" },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.stage.update({ where: { id: stage.id }, data: { position: neighbor.position } }),
        prisma.stage.update({ where: { id: neighbor.id }, data: { position: stage.position } }),
      ]);
    }
  }

  const updated = await prisma.stage.update({
    where: { id: stage.id },
    data: { name, color: parsed.data.color, probabilidade: parsed.data.probabilidade },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera as etapas" }, { status: 403 });

  const stage = await prisma.stage.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Negociação não pode ficar sem etapa (Restrict no schema). Apagar com
  // negociações dentro as perderia do funil; melhor pedir que movam antes.
  const dentro = await prisma.negociacao.count({ where: { stageId: stage.id } });
  if (dentro > 0) {
    return NextResponse.json(
      { error: `Esta etapa ainda tem ${dentro} negociação(ões). Mova-as para outra etapa antes de apagar.` },
      { status: 409 }
    );
  }

  await prisma.stage.delete({ where: { id: stage.id } });
  return NextResponse.json({ ok: true });
}
