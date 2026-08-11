import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

// Chamado quando o atendente abre a conversa no Inbox — marca as mensagens
// recebidas ainda não vistas como lidas (badge de não lida no dashboard,
// não tem relação com o "lido" azul do WhatsApp do cliente).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.message.updateMany({
    where: { conversationId: conversation.id, direction: "INBOUND", readAt: null },
    data: { readAt: new Date() },
  });

  // Abrir a conversa é justamente o "eu vi que me passaram isso" — apagar o
  // aviso de transferência aqui evita um botão de "marcar como visto" que
  // ninguém clicaria. Só quem recebeu a transferência apaga: se outra pessoa
  // abrir a conversa, o responsável continua com o aviso esperando por ele.
  if (conversation.assignedToId === user.id && conversation.assignedAt) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignmentSeenAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
