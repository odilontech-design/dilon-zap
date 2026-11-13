import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { equipe } from "@/lib/instagram-api";

/** As mensagens de uma conversa; abrir marca como lida. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, bloqueio } = await equipe();
  if (bloqueio) return bloqueio;
  const conversa = await prisma.instagramConversa.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true, nome: true, username: true, ultimaEntradaEm: true, telefone: true, negociacaoId: true } });
  if (!conversa) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });
  const mensagens = await prisma.instagramMensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { enviadaEm: "asc" }, take: 300, select: { id: true, direcao: true, texto: true, enviadaEm: true } });
  await prisma.instagramConversa.update({ where: { id: conversa.id }, data: { naoLidas: 0 } });
  return NextResponse.json({ conversa, mensagens, podeResponderAte: conversa.ultimaEntradaEm ? new Date(conversa.ultimaEntradaEm.getTime() + 24 * 3600_000) : null });
}
