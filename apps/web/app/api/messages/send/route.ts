import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const mediaSchema = z.object({
  mediaKey: z.string(),
  mediaType: z.enum(["AUDIO", "IMAGE", "DOCUMENT", "VIDEO"]),
  mediaMimeType: z.string(),
  mediaFileName: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
});

const bodySchema = z
  .object({
    conversationId: z.string(),
    text: z.string().max(4096).optional(),
    media: mediaSchema.optional(),
    quotedMessageId: z.string().optional(),
  })
  .refine((v) => (v.text && v.text.trim().length > 0) || v.media, {
    message: "mensagem precisa de texto ou anexo",
  });

// Só cria a mensagem como PENDING — quem efetivamente manda pro WhatsApp é o
// worker, que fica varrendo a fila (ver apps/worker/src/session-manager.ts).
// O anexo já foi subido pro R2 antes (ver /api/messages/attachments) — aqui
// só referenciamos a mediaKey.
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Só permite citar mensagem da MESMA conversa — igual WhatsApp, e evita
  // vazar/citar conteúdo de outro atendimento.
  const quotedMessage = parsed.data.quotedMessageId
    ? await prisma.message.findFirst({
        where: { id: parsed.data.quotedMessageId, conversationId: conversation.id },
        select: { id: true },
      })
    : null;

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sessionId: conversation.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: parsed.data.text ?? "",
      senderUserId: user.id,
      mediaType: parsed.data.media?.mediaType,
      mediaKey: parsed.data.media?.mediaKey,
      mediaMimeType: parsed.data.media?.mediaMimeType,
      mediaFileName: parsed.data.media?.mediaFileName,
      mediaDurationSeconds: parsed.data.media?.durationSeconds,
      quotedMessageId: quotedMessage?.id,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(message);
}
