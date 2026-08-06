import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { reactWhatsAppMessage } from "@/lib/worker-client";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const bodySchema = z.object({ emoji: z.string().trim().min(1).max(8) });

// Reagir sempre grava fromMe: true — só existem duas identidades possíveis
// num chat 1:1 (a empresa e o contato), e reagir é sempre "nós" reagindo,
// não importa se a mensagem alvo é nossa ou do cliente.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) } },
    include: { conversation: { include: { contact: true } } },
  });
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!message.waMessageId) {
    return NextResponse.json({ error: "essa mensagem não pode receber reação" }, { status: 400 });
  }

  const result = await reactWhatsAppMessage(
    user.tenantId,
    message.conversation.contact.waJid,
    message.waMessageId,
    message.direction === "OUTBOUND",
    parsed.data.emoji
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "não foi possível reagir agora" }, { status: 502 });
  }

  const reaction = await prisma.messageReaction.upsert({
    where: { messageId_fromMe: { messageId: message.id, fromMe: true } },
    create: { messageId: message.id, fromMe: true, emoji: parsed.data.emoji, reactorUserId: user.id },
    update: { emoji: parsed.data.emoji, reactorUserId: user.id },
  });
  return NextResponse.json(reaction);
}

// Remove a nossa reação (fromMe: true) — clicar de novo no mesmo emoji, no
// app oficial do WhatsApp, tira a reação em vez de reenviar.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) } },
    include: { conversation: { include: { contact: true } } },
  });
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (message.waMessageId) {
    await reactWhatsAppMessage(
      user.tenantId,
      message.conversation.contact.waJid,
      message.waMessageId,
      message.direction === "OUTBOUND",
      ""
    );
  }

  await prisma.messageReaction.deleteMany({ where: { messageId: message.id, fromMe: true } });
  return NextResponse.json({ ok: true });
}
