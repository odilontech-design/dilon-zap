import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const bodySchema = z.object({
  pipelineStage: z.enum(["NOVO_LEAD", "EM_CONTATO", "PROPOSTA_ENVIADA", "FECHADO", "PERDIDO"]).optional(),
  name: z.string().max(120).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: parsed.data,
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

  return NextResponse.json({ ok: true });
}
