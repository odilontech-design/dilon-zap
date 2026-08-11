import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const bodySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
  assignedToId: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(conversation);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Se atribuindo a alguém, confere que esse alguém é do mesmo tenant —
  // senão dá pra atribuir conversa da Believe pra um agente de outro negócio.
  if (parsed.data.assignedToId) {
    const agent = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, tenantId: user.tenantId },
    });
    if (!agent) return NextResponse.json({ error: "agente inválido" }, { status: 400 });
  }

  // Transferência: só conta quando o responsável REALMENTE muda. Sem essa
  // comparação, salvar etiqueta ou status numa conversa já atribuída
  // reacenderia o aviso de "transferida pra você" do nada.
  const transferiu =
    parsed.data.assignedToId !== undefined && parsed.data.assignedToId !== conversation.assignedToId;

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      ...parsed.data,
      ...(transferiu
        ? {
            assignedAt: parsed.data.assignedToId ? new Date() : null,
            assignedById: parsed.data.assignedToId ? user.id : null,
            // Quem pega a conversa pra si não precisa ser avisado de que
            // pegou — já marca como visto pra não nascer um aviso inútil.
            assignmentSeenAt: parsed.data.assignedToId === user.id ? new Date() : null,
          }
        : {}),
    },
  });

  if (Object.keys(parsed.data).length > 0) {
    await logAudit({
      actor: user,
      action: "conversation.update",
      metadata: { conversationId: conversation.id, ticketNumber: conversation.ticketNumber, changes: parsed.data },
    });
  }

  return NextResponse.json(updated);
}
