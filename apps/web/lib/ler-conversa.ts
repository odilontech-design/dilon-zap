import { prisma } from "@dilon-zap/db";
import { marcarLidasNoWhatsApp } from "@/lib/worker-client";

/**
 * Marca como lidas as mensagens do cliente numa conversa — no Dilon Zap e no
 * WhatsApp do aparelho conectado, para os dois contarem igual (Hemoderi,
 * 15/10). Usado ao abrir a conversa e ao responder.
 */
export async function lerConversa(conversa: { id: string; sessionId: string; contact: { waJid: string } }) {
  const naoLidas = await prisma.message.findMany({
    where: { conversationId: conversa.id, direction: "INBOUND", readAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, waMessageId: true, autorJid: true },
  });
  if (naoLidas.length === 0) return;

  await prisma.message.updateMany({
    where: { id: { in: naoLidas.map((m) => m.id) } },
    data: { readAt: new Date() },
  });

  const paraOWhatsApp = naoLidas
    .filter((m) => m.waMessageId)
    .map((m) => ({ id: m.waMessageId!, participant: m.autorJid }));
  // Sem esperar: o lido do sistema já valeu, e o aviso ao aparelho é extra.
  void marcarLidasNoWhatsApp(conversa.sessionId, conversa.contact.waJid, paraOWhatsApp);
}
