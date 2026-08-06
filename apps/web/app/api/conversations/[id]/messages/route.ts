import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Confere que a conversa é do tenant logado (e visível pro papel dele)
  // antes de devolver qualquer coisa.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { name: true } },
      quotedMessage: {
        select: { id: true, body: true, direction: true, mediaType: true, isDeleted: true, sender: { select: { name: true } } },
      },
      reactions: { select: { id: true, emoji: true, fromMe: true } },
    },
  });

  return NextResponse.json(messages);
}
