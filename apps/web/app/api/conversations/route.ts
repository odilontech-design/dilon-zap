import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const VALID_STATUS = ["OPEN", "PENDING", "RESOLVED"] as const;

export async function GET(req: Request) {
  const user = await requireUser();
  const statusParam = new URL(req.url).searchParams.get("status");
  const status = VALID_STATUS.includes(statusParam as (typeof VALID_STATUS)[number])
    ? (statusParam as (typeof VALID_STATUS)[number])
    : undefined;

  const conversations = await prisma.conversation.findMany({
    where: { tenantId: user.tenantId, ...(status ? { status } : {}) },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(conversations);
}
