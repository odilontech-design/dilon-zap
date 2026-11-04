import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

/**
 * GET /api/conversations/[id]/presenca — online / digitando / visto por último
 * do contato, como no WhatsApp. Só existe enquanto alguém está com a conversa
 * aberta (a tela consulta em laço lento); quem assina a presença no WhatsApp é
 * o worker, sob demanda. Grupo não tem.
 *
 * Melhor esforço: worker fora do ar ou contato que esconde o "visto por
 * último" devolvem estado nulo, e a tela simplesmente não mostra nada.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const conversa = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
    select: { sessionId: true, contact: { select: { waJid: true, phoneNumber: true, grupo: true } } },
  });
  if (!conversa) return NextResponse.json({ error: "not found" }, { status: 404 });
  const vazio = { estado: null, vistoEm: null };
  if (conversa.contact.grupo || !conversa.sessionId) return NextResponse.json(vazio);

  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return NextResponse.json(vazio);
  try {
    const res = await fetch(`${baseUrl}/internal/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        sessionId: conversa.sessionId,
        waJid: conversa.contact.waJid,
        // Contato guardado por @lid pode ter a presença chegando pelo número, e vice-versa.
        alternativo: conversa.contact.phoneNumber,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return NextResponse.json(vazio);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(vazio);
  }
}
