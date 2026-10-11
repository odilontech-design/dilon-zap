import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";

const criarSchema = z.object({ texto: z.string().trim().min(1).max(4000) });

/** POST /api/negociacoes/[id]/notas — anotação na linha do tempo. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = criarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "escreva a anotação" }, { status: 400 });

  const n = await prisma.negociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  const nota = await prisma.negociacaoNota.create({
    data: { tenantId: user.tenantId, negociacaoId: n.id, texto: parsed.data.texto, porUserId: user.id, porNome: user.name },
    select: { id: true, texto: true, porUserId: true, porNome: true, em: true },
  });
  // Mexer na negociação conta como movimento: ela sobe na lista do quadro.
  await prisma.negociacao.update({ where: { id: n.id }, data: { updatedAt: new Date() } });
  return NextResponse.json(nota);
}

/** DELETE /api/negociacoes/[id]/notas?nota=… — quem escreveu ou a gestão. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const notaId = new URL(req.url).searchParams.get("nota") ?? "";
  const nota = await prisma.negociacaoNota.findFirst({
    where: { id: notaId, negociacaoId: params.id, tenantId: user.tenantId },
    select: { id: true, porUserId: true },
  });
  if (!nota) return NextResponse.json({ error: "anotação não encontrada" }, { status: 404 });
  if (nota.porUserId !== user.id && !ehGerencia(user.role)) {
    return NextResponse.json({ error: "só quem escreveu ou a gestão apagam" }, { status: 403 });
  }
  await prisma.negociacaoNota.delete({ where: { id: nota.id } });
  return NextResponse.json({ ok: true });
}
