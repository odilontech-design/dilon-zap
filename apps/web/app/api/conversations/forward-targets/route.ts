import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

// Lista enxuta de conversas pro seletor de "Encaminhar" — mesma visibilidade
// do Inbox (AGENT não encaminha pra conversa que nem consegue ver).
export async function GET() {
  const user = await requireUser();

  const conversations = await prisma.conversation.findMany({
    where: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      contact: { select: { id: true, name: true, waJid: true, phoneNumber: true, avatarUrl: true, lastStatusAt: true } },
    },
  });

  return NextResponse.json(conversations);
}
