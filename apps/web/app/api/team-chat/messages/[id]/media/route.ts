import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { podeVerCanal, podeVerConversaDireta } from "@/lib/team-chat";

// Mesma ideia do /api/messages/[id]/media: nunca expõe a mediaKey nem as
// credenciais do R2 pro navegador — confere acesso ao canal e redireciona
// pra uma URL assinada de leitura.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const mensagem = await prisma.teamMessage.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { mediaKey: true, setorId: true, authorId: true, destinatarioId: true },
  });
  if (!mensagem?.mediaKey) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (mensagem.destinatarioId) {
    // Direta: só quem escreveu e quem recebeu, sem exceção de papel.
    if (!podeVerConversaDireta(user.id, mensagem.authorId, mensagem.destinatarioId)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  } else {
    const membros = await prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } });
    if (!podeVerCanal(user.role, membros.map((m) => m.setorId), mensagem.setorId)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  const url = await getMediaReadUrl(mensagem.mediaKey);
  return NextResponse.redirect(url);
}
