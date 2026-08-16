import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

/**
 * Lista pedidos. Dois usos:
 *  - `?conversationId=` — o que o Inbox mostra dentro da conversa
 *  - `?status=AGUARDANDO_FINANCEIRO` — a fila do financeiro
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const status = url.searchParams.get("status");

  // A fila é do financeiro e do responsável: a consultora não precisa ver o
  // que as outras mandaram fechar, e mostrar isso viraria ruído.
  if (!conversationId && user.role !== "OWNER" && user.role !== "FINANCEIRO") {
    return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  }

  const pedidos = await prisma.order.findMany({
    where: {
      tenantId: user.tenantId,
      ...(conversationId ? { conversationId } : {}),
      ...(status ? { status: status as never } : {}),
      // Cancelado só aparece quando pedido explicitamente: é ruído na
      // conversa e na fila.
      ...(status ? {} : { status: { not: "CANCELADO" } }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      numero: true,
      status: true,
      paymentMethod: true,
      pago: true,
      subtotalCents: true,
      descontoCents: true,
      totalCents: true,
      observacao: true,
      createdAt: true,
      enviadoAoFinanceiroEm: true,
      fechadoEm: true,
      createdBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      contact: { select: { id: true, name: true, waJid: true, phoneNumber: true, avatarUrl: true } },
      conversation: { select: { id: true, ticketNumber: true } },
      items: {
        select: {
          id: true,
          nomeProduto: true,
          precoTabelaCents: true,
          precoUnitCents: true,
          quantidade: true,
          productId: true,
        },
      },
    },
  });

  return NextResponse.json(pedidos);
}

const criarSchema = z.object({
  conversationId: z.string().min(1),
});

/** Abre um rascunho vazio pra conversa. Os itens entram em seguida. */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const conversa = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.conversationId,
      tenantId: user.tenantId,
      ...conversationVisibilityWhere(user),
    },
    select: { id: true, contactId: true },
  });
  if (!conversa) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Um rascunho aberto por vez na mesma conversa. Sem isso, cada clique no
  // botão criaria um pedido vazio e a conversa acumularia rascunhos que
  // ninguém fechou.
  const existente = await prisma.order.findFirst({
    where: { conversationId: conversa.id, status: "RASCUNHO" },
    select: { id: true },
  });
  if (existente) return NextResponse.json(existente, { status: 200 });

  const criado = await prisma.order.create({
    data: {
      tenantId: user.tenantId,
      contactId: conversa.contactId,
      conversationId: conversa.id,
      createdById: user.id,
    },
    select: { id: true, numero: true, status: true },
  });

  return NextResponse.json(criado, { status: 201 });
}
