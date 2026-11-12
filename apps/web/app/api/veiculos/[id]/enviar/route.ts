import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { envioSchema } from "@/lib/veiculos-schemas";
import { enviarVeiculo } from "@/lib/veiculos";
import { respostaDeErro } from "@/lib/veiculos-api";

/**
 * Manda o carro (ficha + fotos) pelo WhatsApp. Na conversa aberta do Inbox
 * (`conversationId`, respeitando quem pode ver a conversa) ou para um contato
 * a partir da ficha do carro (`contactId`, pelo número geral da loja).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const parsed = envioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "diga para quem mandar" }, { status: 400 });
  const d = parsed.data;

  let conversation = null;
  if ("conversationId" in d) {
    conversation = await prisma.conversation.findFirst({
      where: { id: d.conversationId, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
      select: { id: true, sessionId: true, setorId: true },
    });
    if (!conversation) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });
  }
  try {
    const r = await enviarVeiculo({
      tenantId: user.tenantId,
      userId: user.id,
      veiculoId: params.id,
      conversation,
      contactId: "contactId" in d ? d.contactId : null,
      fotos: d.fotos ?? 5,
    });
    return NextResponse.json(r);
  } catch (e) {
    return respostaDeErro(e);
  }
}
