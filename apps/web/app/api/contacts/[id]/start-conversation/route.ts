import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Fase 0/1: um número por tenant, então "iniciar conversa" sempre usa a
// sessão mais recente do tenant. Quando existir mais de um número, isso
// precisa virar uma escolha explícita na tela.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const session = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!session) {
    return NextResponse.json({ error: "Nenhum número de WhatsApp conectado ainda." }, { status: 400 });
  }

  // upsert em vez de find-then-create: dois cliques rápidos em "iniciar
  // conversa" (ou um clique concorrente com uma mensagem chegando ao mesmo
  // tempo pelo worker) não podem criar duas conversas pro mesmo contato.
  const conversation = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: contact.id, sessionId: session.id } },
    update: {},
    create: { tenantId: user.tenantId, contactId: contact.id, sessionId: session.id },
  });

  return NextResponse.json(conversation);
}
