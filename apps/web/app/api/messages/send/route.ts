import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const bodySchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1).max(4096),
});

// Só cria a mensagem como PENDING — quem efetivamente manda pro WhatsApp é o
// worker, que fica varrendo a fila (ver apps/worker/src/session-manager.ts).
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, tenantId: user.tenantId },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sessionId: conversation.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: parsed.data.text,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(message);
}
