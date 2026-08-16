import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const patchSchema = z.object({
  // "liberar" tira do estado segurado e manda na próxima varredura;
  // "cancelar" descarta de vez. São as duas saídas de um agendamento que
  // ficou parado esperando decisão.
  acao: z.enum(["liberar", "cancelar"]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const agendada = await prisma.scheduledMessage.findFirst({
    where: {
      id: params.id,
      tenantId: user.tenantId,
      conversation: { ...conversationVisibilityWhere(user) },
    },
  });
  if (!agendada) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (agendada.status === "SENT") {
    return NextResponse.json({ error: "essa mensagem já saiu" }, { status: 400 });
  }

  if (parsed.data.acao === "cancelar") {
    const r = await prisma.scheduledMessage.update({
      where: { id: agendada.id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true },
    });
    return NextResponse.json(r);
  }

  // Liberar: volta pra PENDING com a hora AGORA, pra sair na próxima
  // varredura. E o marco de comparação é atualizado — senão o worker olharia
  // a mesma mensagem do cliente que causou a retenção e seguraria de novo,
  // num laço que a atendente não teria como quebrar.
  const ultimaEntrada = await prisma.message.findFirst({
    where: { conversationId: agendada.conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const r = await prisma.scheduledMessage.update({
    where: { id: agendada.id },
    data: {
      status: "PENDING",
      scheduledFor: new Date(),
      heldAt: null,
      lastInboundAtOnSchedule: ultimaEntrada?.createdAt ?? null,
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(r);
}
