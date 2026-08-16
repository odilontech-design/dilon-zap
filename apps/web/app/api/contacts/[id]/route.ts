import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  stageId: z.string().nullable().optional(),
  dealValueCents: z.number().int().min(0).optional(),
  name: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Confere que a etapa é do mesmo tenant — senão dá pra mover contato da
  // Believe pra uma etapa cadastrada por outro negócio.
  if (parsed.data.stageId) {
    const stage = await prisma.stage.findFirst({ where: { id: parsed.data.stageId, tenantId: user.tenantId } });
    if (!stage) return NextResponse.json({ error: "etapa inválida" }, { status: 400 });
  }

  const { notes, ...resto } = parsed.data;

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...resto,
      // Anotação em branco volta pra null, e não string vazia: "sem
      // anotação" e "anotação apagada" são a mesma coisa pra quem lê, e a
      // UI só precisa checar um caso.
      ...(notes !== undefined
        ? { notes: notes?.trim() ? notes.trim() : null, notesUpdatedAt: new Date() }
        : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // onDelete: Cascade no schema cuida de apagar junto as conversas e mensagens desse contato.
  await prisma.contact.delete({ where: { id: contact.id } });

  await logAudit({ actor: user, action: "contact.delete", metadata: { waJid: contact.waJid, name: contact.name } });

  return NextResponse.json({ ok: true });
}
