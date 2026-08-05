import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

// Total do tenant, sem filtrar por status/aba — usado só pra saber quando
// tocar o som de notificação (mensagem nova pode chegar numa conversa que
// não está na aba que o atendente tá olhando agora). Só conta conversa que
// o papel dele pode ver, senão o som tocaria pra mensagem que ele nem
// consegue abrir.
export async function GET() {
  const user = await requireUser();

  const count = await prisma.message.count({
    where: {
      direction: "INBOUND",
      readAt: null,
      conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
    },
  });

  return NextResponse.json({ count });
}
