import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Total do tenant, sem filtrar por status/aba — usado só pra saber quando
// tocar o som de notificação (mensagem nova pode chegar numa conversa que
// não está na aba que o atendente tá olhando agora).
export async function GET() {
  const user = await requireUser();

  const count = await prisma.message.count({
    where: { direction: "INBOUND", readAt: null, conversation: { tenantId: user.tenantId } },
  });

  return NextResponse.json({ count });
}
