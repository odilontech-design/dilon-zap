import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { wakeOutbox } from "@/lib/worker-client";

const bodySchema = z.object({
  conversationIds: z.array(z.string()).min(1).max(20),
});

// Encaminha o texto/mídia de uma mensagem existente pra uma ou mais outras
// conversas — igual "Encaminhar" do WhatsApp. Mídia reaproveita a mesma
// mediaKey do R2 (não reenvia o arquivo). Quem manda de fato é o worker,
// via a mesma fila de outbox de sempre (mensagem nasce PENDING).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const source = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...conversationVisibilityWhere(user) } },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (source.isDeleted) return NextResponse.json({ error: "essa mensagem foi apagada" }, { status: 400 });

  const targets = await prisma.conversation.findMany({
    where: {
      id: { in: parsed.data.conversationIds },
      tenantId: user.tenantId,
      ...conversationVisibilityWhere(user),
    },
  });
  if (targets.length === 0) return NextResponse.json({ error: "nenhuma conversa válida selecionada" }, { status: 400 });

  const created = await prisma.$transaction(
    targets.map((conversation) =>
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          sessionId: conversation.sessionId,
          direction: "OUTBOUND",
          status: "PENDING",
          body: source.body,
          senderUserId: user.id,
          mediaType: source.mediaType,
          mediaKey: source.mediaKey,
          mediaMimeType: source.mediaMimeType,
          mediaFileName: source.mediaFileName,
          mediaDurationSeconds: source.mediaDurationSeconds,
          isForwarded: true,
        },
      })
    )
  );

  await prisma.conversation.updateMany({
    where: { id: { in: targets.map((c) => c.id) } },
    data: { lastMessageAt: new Date() },
  });

  // Tira o worker do ritmo ocioso pras mensagens saírem na hora.
  await wakeOutbox(user.tenantId);

  return NextResponse.json({ ok: true, count: created.length });
}
