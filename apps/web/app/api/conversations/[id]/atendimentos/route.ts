import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { montarMarcadores } from "@/lib/atendimentos";

/**
 * Os ciclos de atendimento de uma conversa, pra desenhar os marcadores.
 *
 * Rota própria, e não junto de /messages, de propósito: aquela é consultada em
 * laço pelo Inbox e o projeto já cuida do tamanho do payload dela. Os ciclos
 * mudam quando alguém fecha ou reabre — raramente — e não precisam viajar a
 * cada atualização da lista de mensagens.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const conversa = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
    select: {
      createdAt: true,
      status: true,
      ticketNumber: true,
      atendimentos: {
        orderBy: { encerradoEm: "asc" },
        select: {
          iniciadoEm: true,
          encerradoEm: true,
          motivo: true,
          encerradoPor: { select: { name: true } },
        },
      },
    },
  });
  if (!conversa) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ticketNumber: conversa.ticketNumber,
    marcadores: montarMarcadores(
      conversa.createdAt,
      conversa.atendimentos,
      conversa.status === "RESOLVED"
    ),
  });
}
