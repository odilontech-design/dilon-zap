import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * Apagar a própria mensagem (ou qualquer uma, se Responsável/superadmin) —
 * igual ao Inbox, mantém a linha (quem mandou o quê) e some só o conteúdo.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const mensagem = await prisma.teamMessage.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, authorId: true },
  });
  if (!mensagem) return NextResponse.json({ error: "not found" }, { status: 404 });

  const podeApagar =
    mensagem.authorId === user.id || user.role === "OWNER" || user.role === "SUPERADMIN";
  if (!podeApagar) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  await prisma.teamMessage.update({
    where: { id: mensagem.id },
    data: { isDeleted: true, deletedAt: new Date(), body: "", mediaKey: null },
  });

  return NextResponse.json({ ok: true });
}
