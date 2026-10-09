import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const schema = z.object({
  concluida: z.boolean().optional(),
  tipo: z.enum(["LIGACAO", "WHATSAPP", "REUNIAO", "EMAIL", "TAREFA"]).optional(),
  titulo: z.string().trim().min(1).max(160).optional(),
  venceEm: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "data inválida").optional(),
  responsavelId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const tarefa = await prisma.tarefaNegociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!tarefa) return NextResponse.json({ error: "tarefa não encontrada" }, { status: 404 });

  if (d.responsavelId) {
    const resp = await prisma.user.findFirst({ where: { id: d.responsavelId, tenantId: user.tenantId }, select: { id: true } });
    if (!resp) return NextResponse.json({ error: "responsável inválido" }, { status: 400 });
  }

  await prisma.tarefaNegociacao.update({
    where: { id: tarefa.id },
    data: {
      ...(d.tipo !== undefined ? { tipo: d.tipo } : {}),
      ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
      ...(d.venceEm !== undefined ? { venceEm: new Date(d.venceEm) } : {}),
      ...(d.responsavelId !== undefined ? { responsavelId: d.responsavelId } : {}),
      // Concluir é carimbar a data; reabrir limpa. Concluir uma já concluída
      // não troca a data original.
      ...(d.concluida === true && !tarefa.concluidaEm ? { concluidaEm: new Date() } : {}),
      ...(d.concluida === false ? { concluidaEm: null } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const tarefa = await prisma.tarefaNegociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!tarefa) return NextResponse.json({ error: "tarefa não encontrada" }, { status: 404 });

  await prisma.tarefaNegociacao.delete({ where: { id: tarefa.id } });
  return NextResponse.json({ ok: true });
}
