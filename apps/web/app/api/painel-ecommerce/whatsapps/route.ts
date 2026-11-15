import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { motivoDePeriodoInvalido } from "@/lib/painel-ecommerce";
import { limitesDoPeriodo, rotuloDaReferencia } from "@/lib/painel-whatsapps";
import { contactLabel, formatPhoneDisplay } from "@/lib/contact";

/**
 * GET /api/painel-ecommerce/whatsapps?de=AAAA-MM-DD&ate=AAAA-MM-DD — o que o site mandou por WhatsApp e para quem,
 * lido do próprio Inbox (mensagens que entraram pela porta de integração, com referência). Só a gestão.
 * `?falhas=1` devolve só as que não saíram. Até 300 mensagens, as mais recentes primeiro.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PAINEL_ECOMMERCE");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê o painel do site" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const de = q.get("de");
  const ate = q.get("ate");
  const motivo = motivoDePeriodoInvalido(de, ate);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });
  const { inicio, fim } = limitesDoPeriodo(de!, ate!);

  const mensagens = await prisma.message.findMany({
    where: {
      conversation: { tenantId: user.tenantId },
      direction: "OUTBOUND",
      senderUserId: null,
      referenciaExterna: { not: null },
      createdAt: { gte: inicio, lt: fim },
      ...(q.get("falhas") === "1" ? { status: "FAILED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      createdAt: true,
      status: true,
      errorMessage: true,
      body: true,
      referenciaExterna: true,
      conversationId: true,
      conversation: { select: { contact: { select: { name: true, waJid: true, phoneNumber: true } } } },
    },
  });

  return NextResponse.json({
    mensagens: mensagens.map((m) => {
      const r = rotuloDaReferencia(m.referenciaExterna);
      const c = m.conversation.contact;
      return {
        id: m.id,
        quando: m.createdAt.getTime(),
        status: m.status,
        erro: m.status === "FAILED" ? m.errorMessage : null,
        tipo: r.tipo,
        pedido: r.pedido,
        contato: contactLabel(c),
        telefone: formatPhoneDisplay(c),
        texto: m.body ?? "",
        conversationId: m.conversationId,
      };
    }),
  });
}
