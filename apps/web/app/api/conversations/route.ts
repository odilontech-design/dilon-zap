import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

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
    ...(search
      ? {
          OR: [
            { contact: { name: { contains: search, mode: "insensitive" } } },
            ...(searchDigits ? [{ contact: { waJid: { contains: searchDigits } } }] : []),
            ...(searchDigits ? [{ contact: { phoneNumber: { contains: searchDigits } } }] : []),
            { messages: { some: { body: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { direction: "INBOUND", readAt: null } } } },
    },
  });

  const withUnread = conversations.map(({ _count, ...c }) => ({ ...c, unreadCount: _count.messages }));

  return NextResponse.json(withUnread);
}
