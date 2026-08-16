import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

/** Agendamentos de uma conversa: o que ainda vai sair e o que ficou segurado. */
export async function GET(req: Request) {
  const user = await requireUser();
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });

  const conversa = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
    select: { id: true },
  });
  if (!conversa) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agendamentos = await prisma.scheduledMessage.findMany({
    // Enviados e cancelados não entram: a mensagem enviada já está na
    // conversa, e cancelada não é informação que a atendente precise rever.
    where: { conversationId, status: { in: ["PENDING", "HELD"] } },
    orderBy: { scheduledFor: "asc" },
    select: {
      id: true,
      body: true,
      scheduledFor: true,
      status: true,
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(agendamentos);
}

const criarSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(4096),
  scheduledFor: z.string().datetime(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { conversationId, body, scheduledFor } = parsed.data;
  const quando = new Date(scheduledFor);

  // Um minuto de folga: o relógio do navegador e o do servidor não batem
  // exatamente, e recusar "daqui a 30 segundos" por causa disso seria
  // rejeitar um pedido legítimo.
  if (quando.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "escolha um horário no futuro" }, { status: 400 });
  }

  const conversa = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
    select: { id: true },
  });
  if (!conversa) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Marco pra comparar depois. Guardado AGORA, no momento do agendamento:
  // na hora do envio o worker pergunta "entrou mensagem do cliente depois
  // deste instante?" — que é a pergunta certa, e não "existe mensagem
  // recente", que seria verdade em qualquer conversa ativa.
  const ultimaEntrada = await prisma.message.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const criado = await prisma.scheduledMessage.create({
    data: {
      tenantId: user.tenantId,
      conversationId,
      body,
      scheduledFor: quando,
      createdById: user.id,
      lastInboundAtOnSchedule: ultimaEntrada?.createdAt ?? null,
    },
    select: { id: true, body: true, scheduledFor: true, status: true },
  });

  return NextResponse.json(criado, { status: 201 });
}
