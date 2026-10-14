import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { naoLidasDoChat } from "@/lib/team-chat-leitura";

/**
 * Mensagens não lidas para o menu da esquerda: Inbox (só as conversas que a
 * pessoa enxerga) e Grupos (os grupos acompanhados, que são da equipe toda).
 * Duas contagens leves — o menu está em toda tela e consulta isto em laço.
 */
export async function GET() {
  const user = await requireUser();
  const [inbox, grupos, chat] = await Promise.all([
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
  ]);
  return NextResponse.json({ inbox, grupos, chatEquipe: chat.total });
}
