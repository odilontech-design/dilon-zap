import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { telefoneConhecido } from "@/lib/contact";
import { montarRecibo } from "@/lib/recibo";
import { wakeOutbox } from "@/lib/worker-client";
import { ReciboImagemJSX } from "@/lib/recibo-imagem";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Documento vem da tela de confirmação do envio. null/ausente não apaga o
  // que já está salvo — só um texto vazio explícito limpa.
  const corpo = (await req.json().catch(() => ({}))) as { documento?: string | null };

  const [tenant, pedido] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        name: true,
        timezone: true,
        reciboNome: true,
        reciboDocumento: true,
        reciboEndereco: true,
        reciboTelefone: true,
        reciboRodape: true,
        reciboChavePix: true,
        reciboLarguraMm: true,
      },
    }),
    prisma.order.findFirst({
      where: { id: params.id, tenantId: user.tenantId },
      select: {
        id: true,
        numero: true,
        status: true,
        createdAt: true,
        fechadoEm: true,
        paymentMethod: true,
        pago: true,
        pagoEm: true,
        vencimento: true,
        subtotalCents: true,
        descontoCents: true,
        totalCents: true,
        observacao: true,
        createdBy: { select: { name: true } },
        items: {
          select: { nomeProduto: true, precoTabelaCents: true, precoUnitCents: true, quantidade: true },
          orderBy: { id: "asc" },
        },
        pagamentos: { select: { valorCents: true } },
        contact: {
          select: {
            id: true,
            name: true,
            waJid: true,
            phoneNumber: true,
            documento: true,
            endereco: true,
          },
        },
        conversationId: true,
      },
    }),
  ]);

  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  if (pedido.status !== "FECHADO") {
    return NextResponse.json({ error: "Só pode enviar recibo de pedido já fechado." }, { status: 400 });
  }

  // Salva antes de montar o recibo: o comprovante que sai já leva o número
  // que a pessoa acabou de digitar, e os próximos pedidos deste cliente vêm
  // com ele preenchido.
  const documento =
    corpo.documento === undefined ? pedido.contact.documento : corpo.documento?.trim() || null;
  if (documento !== pedido.contact.documento) {
    await prisma.contact.update({ where: { id: pedido.contact.id }, data: { documento } });
  }

  const recibo = montarRecibo({
    empresa: { ...tenant, nome: tenant.name },
    pedido: { ...pedido, vendedor: pedido.createdBy?.name ?? null, itens: pedido.items },
    cliente: {
      nome: pedido.contact.name,
      telefone: telefoneConhecido(pedido.contact),
      documento,
      endereco: pedido.contact.endereco,
    },
  });

  // Gera a imagem do recibo via satori (next/og). A altura é auto-calculada
  // com base no conteúdo — estimamos pela quantidade de itens.
  const alturaEstimada = 480 + recibo.itens.length * 56 + recibo.cliente.length * 22
    + recibo.pagamento.length * 22 + (recibo.vendedor ? 22 : 0) + (recibo.observacao ? 22 : 0);

  const imgResponse = new ImageResponse(ReciboImagemJSX({ recibo }), {
    width: 600,
    height: alturaEstimada,
  });

  const pngBuffer = Buffer.from(await imgResponse.arrayBuffer());

  // Upload para R2
  const mediaKey = `${user.tenantId}/recibos/${pedido.id}-${randomUUID().slice(0, 8)}.png`;
  await uploadMedia(mediaKey, pngBuffer, "image/png");

  // Encontra ou cria a conversa com o contato
  const session = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!session) {
    return NextResponse.json({ error: "Nenhum número de WhatsApp conectado." }, { status: 400 });
  }

  let conversationId = pedido.conversationId;
  if (!conversationId) {
    const conv = await prisma.conversation.upsert({
      where: { contactId_sessionId: { contactId: pedido.contact.id, sessionId: session.id } },
      update: {},
      create: { tenantId: user.tenantId, contactId: pedido.contact.id, sessionId: session.id },
    });
    conversationId = conv.id;
  }

  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { setorId: true },
  });

  const legenda = `Comprovante do pedido #${pedido.numero}`;
  await prisma.message.create({
    data: {
      conversationId,
      sessionId: session.id,
      direction: "OUTBOUND",
      status: "PENDING",
      body: legenda,
      senderUserId: user.id,
      mediaType: "IMAGE",
      mediaKey,
      mediaMimeType: "image/png",
      mediaFileName: `recibo-${pedido.numero}.png`,
      setorId: conv.setorId,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  await wakeOutbox(user.tenantId);

  return NextResponse.json({ ok: true });
}
