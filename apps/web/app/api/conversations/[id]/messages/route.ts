import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Confere que a conversa é do tenant logado antes de devolver qualquer coisa.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}
