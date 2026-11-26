import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { naoLidasDoChat, naoLidasDoSuporte } from "@/lib/team-chat-leitura";

/**
 * Mensagens não lidas para o menu da esquerda: Inbox (só as conversas que a
 * pessoa enxerga) e Grupos (os grupos acompanhados, que são da equipe toda).
 * Duas contagens leves — o menu está em toda tela e consulta isto em laço.
 */
export async function GET() {
  const user = await requireUser();
  const [inbox, grupos, chat, suporte, instagram] = await Promise.all([
    prisma.message.count({
      where: {
        direction: "INBOUND",
        readAt: null,
        conversation: { tenantId: user.tenantId, contact: { grupo: false }, ...(await conversationVisibilityWhere(user, { listagem: true })) },
      },
    }),
    prisma.message.count({
      where: {
        direction: "INBOUND",
        readAt: null,
        conversation: { tenantId: user.tenantId, contact: { grupo: true, grupoAtivadoEm: { not: null } } },
      },
    }),
    naoLidasDoChat(user),
    // Conversas diretas escritas ao suporte (só o SUPERADMIN recebe valor).
    user.role === "SUPERADMIN" ? naoLidasDoSuporte(user) : null,
    // Mensagens do Instagram da loja ainda sem leitura (aparecem no menu Veículos e na aba Instagram).
    prisma.instagramConversa.aggregate({ where: { tenantId: user.tenantId }, _sum: { naoLidas: true } }),
  ]);
  return NextResponse.json({ inbox, grupos, chatEquipe: chat.total, suporte: suporte?.totalDiretas ?? 0, instagram: instagram._sum.naoLidas ?? 0 });
}
