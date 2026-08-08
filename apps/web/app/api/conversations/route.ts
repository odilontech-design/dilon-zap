import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const VALID_STATUS = ["OPEN", "PENDING", "RESOLVED"] as const;

export async function GET(req: Request) {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;

  const statusParam = params.get("status");
  const status = VALID_STATUS.includes(statusParam as (typeof VALID_STATUS)[number])
    ? (statusParam as (typeof VALID_STATUS)[number])
    : undefined;

  const search = params.get("search")?.trim();
  const tag = params.get("tag")?.trim();
  const assignedToId = params.get("assignedToId")?.trim();
  const unreadOnly = params.get("unreadOnly") === "1";

  const searchDigits = search?.replace(/\D/g, "");

  const where: Prisma.ConversationWhereInput = {
    tenantId: user.tenantId,
    ...(status ? { status } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(unreadOnly ? { messages: { some: { direction: "INBOUND", readAt: null } } } : {}),
    AND: [
      conversationVisibilityWhere(user),
      ...(search
        ? [
            {
              OR: [
                { contact: { name: { contains: search, mode: "insensitive" as const } } },
                ...(searchDigits ? [{ contact: { waJid: { contains: searchDigits } } }] : []),
                ...(searchDigits ? [{ contact: { phoneNumber: { contains: searchDigits } } }] : []),
                { messages: { some: { body: { contains: search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
    ],
  };

  // select explícito (não `include: { contact: true }`) porque essa rota é
  // consultada em loop pelo Inbox de cada atendente — trazer a linha inteira
  // de Conversation/Contact/Message a cada poucos segundos gerava dezenas de
  // KB por consulta só de campo que a tela nem usa (era ~71KB por chamada,
  // ~4GB/dia com 4 atendentes). Aqui só entra o que ConversationSummary lê.
  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      tags: true,
      contact: {
        select: { id: true, name: true, waJid: true, phoneNumber: true, avatarUrl: true, lastStatusAt: true },
      },
      assignedTo: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true, createdAt: true },
      },
      _count: { select: { messages: { where: { direction: "INBOUND", readAt: null } } } },
    },
  });

  // A prévia da lista é uma linha só com `truncate` no CSS — mandar a mensagem
  // inteira (algumas passam de 400 caracteres) é byte jogado fora numa rota
  // consultada em loop. 120 caracteres cobrem qualquer largura de tela.
  const PREVIEW_MAX = 120;
  const withUnread = conversations.map(({ _count, messages, ...c }) => ({
    ...c,
    messages: messages.map((m) => ({ ...m, body: m.body.slice(0, PREVIEW_MAX) })),
    unreadCount: _count.messages,
  }));

  return NextResponse.json(withUnread);
}
