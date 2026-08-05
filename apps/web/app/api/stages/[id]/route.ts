import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5").optional(),
  move: z.enum(["up", "down"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const stage = await prisma.stage.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = parsed.data.name?.trim();
  if (name && name !== stage.name) {
    const clash = await prisma.stage.findUnique({ where: { tenantId_name: { tenantId: user.tenantId, name } } });
    if (clash) return NextResponse.json({ error: "já existe uma etapa com esse nome" }, { status: 409 });
  }

  // Reordenar troca de posição com a coluna vizinha em vez de recalcular tudo
  // — simples e nunca deixa duas colunas com a mesma posição.
  if (parsed.data.move) {
    const goingUp = parsed.data.move === "up";
    const neighbor = await prisma.stage.findFirst({
      where: {
        tenantId: user.tenantId,
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
    data: { name, color: parsed.data.color },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const stage = await prisma.stage.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  // onDelete: SetNull no schema — contatos dessa etapa voltam pra "Sem etapa".
  await prisma.stage.delete({ where: { id: stage.id } });
  return NextResponse.json({ ok: true });
}
