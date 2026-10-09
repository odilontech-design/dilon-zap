import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";

/**
 * Desativa em vez de apagar: negociações perdidas antigas apontam para o
 * motivo, e o relatório de perdas precisa continuar sabendo o nome dele.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera a lista" }, { status: 403 });

  const motivo = await prisma.motivoDePerda.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!motivo) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  await prisma.motivoDePerda.update({ where: { id: motivo.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
