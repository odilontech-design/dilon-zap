import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const FIRST_RESPONSE_SAMPLE_SIZE = 50; // últimas conversas usadas pra calcular a média — evita varrer o histórico inteiro a cada carregamento

export async function GET() {
  const user = await requireUser();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [statusCounts, messages24h, messages7d, sample, agents, session] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["status"],
      where: { tenantId: user.tenantId },
      _count: true,
    }),
    prisma.message.count({
      where: { session: { tenantId: user.tenantId }, createdAt: { gte: since24h } },
    }),
    prisma.message.count({
      where: { session: { tenantId: user.tenantId }, createdAt: { gte: since7d } },
    }),
    prisma.conversation.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { lastMessageAt: "desc" },
      take: FIRST_RESPONSE_SAMPLE_SIZE,
      include: { messages: { orderBy: { createdAt: "asc" }, select: { direction: true, createdAt: true } } },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        assignedConversations: { select: { status: true } },
      },
    }),
    prisma.whatsAppSession.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      select: { status: true, phoneNumber: true },
    }),
  ]);

  const firstResponseMinutes: number[] = [];
  for (const conversation of sample) {
    const firstInbound = conversation.messages.find((m) => m.direction === "INBOUND");
    if (!firstInbound) continue;
    const firstReply = conversation.messages.find(
      (m) => m.direction === "OUTBOUND" && m.createdAt > firstInbound.createdAt
    );
    if (!firstReply) continue;
    firstResponseMinutes.push((firstReply.createdAt.getTime() - firstInbound.createdAt.getTime()) / 60_000);
  }
  const avgFirstResponseMinutes =
    firstResponseMinutes.length > 0
      ? firstResponseMinutes.reduce((a, b) => a + b, 0) / firstResponseMinutes.length
      : null;

  const statusMap = { OPEN: 0, PENDING: 0, RESOLVED: 0 };
  for (const row of statusCounts) statusMap[row.status] = row._count;

  const agentWorkload = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    active: agent.assignedConversations.filter((c) => c.status !== "RESOLVED").length,
    resolved: agent.assignedConversations.filter((c) => c.status === "RESOLVED").length,
  }));

  return NextResponse.json({
    statusCounts: statusMap,
    messages24h,
    messages7d,
    avgFirstResponseMinutes,
    firstResponseSampleSize: firstResponseMinutes.length,
    agentWorkload,
    session,
  });
}
