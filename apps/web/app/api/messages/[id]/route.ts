import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { editWhatsAppMessage, deleteWhatsAppMessage } from "@/lib/worker-client";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const bodySchema = z.object({ text: z.string().trim().min(1).max(4096) });

// Editar só é permitido pra mensagem OUTBOUND de texto (sem mídia) que já
// chegou a sair de verdade pro WhatsApp — WhatsApp não deixa editar mensagem
// do outro lado, nem mídia, nem uma que ainda tá "enviando..."/falhou.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) } },
    include: { conversation: { include: { contact: true } } },
  });
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (message.direction !== "OUTBOUND" || message.isDeleted || message.mediaType || !message.waMessageId) {
    return NextResponse.json({ error: "essa mensagem não pode ser editada" }, { status: 400 });
  }

  const result = await editWhatsAppMessage(
    user.tenantId,
    message.conversation.contact.waJid,
    message.waMessageId,
    parsed.data.text
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "não foi possível editar agora" }, { status: 502 });
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { body: parsed.data.text, isEdited: true, editedAt: new Date() },
  });
  return NextResponse.json(updated);
}

// "Apagar pra todos" — melhor esforço: tenta revogar no WhatsApp, mas marca
// isDeleted localmente de qualquer forma (o prazo do WhatsApp pra revogar é
// curto e pode já ter passado, e mesmo assim faz sentido esconder daqui).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) } },
    include: { conversation: { include: { contact: true } } },
  });
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (message.direction !== "OUTBOUND" || message.isDeleted) {
    return NextResponse.json({ error: "essa mensagem não pode ser apagada" }, { status: 400 });
  }

  if (message.waMessageId) {
    await deleteWhatsAppMessage(user.tenantId, message.conversation.contact.waJid, message.waMessageId);
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  return NextResponse.json(updated);
}
