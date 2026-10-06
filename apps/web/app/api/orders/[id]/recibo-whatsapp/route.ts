import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { wakeOutbox } from "@/lib/worker-client";
import { numeroParaEnviar } from "@/lib/whatsapp-sessions";
import {
  carregarPedidoDoRecibo,
  desenharReciboPng,
  montarReciboDoPedido,
  resolverDadosDoCliente,
  resolverMesReferencia,
  type AjustesDoRecibo,
} from "@/lib/recibo-render";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Nome e documento vêm da tela de confirmação do envio. Campo ausente
  // mantém o que já está salvo na ficha; texto vazio limpa.
  const corpo = (await req.json().catch(() => ({}))) as AjustesDoRecibo;

  const carregado = await carregarPedidoDoRecibo(user.tenantId, params.id);
  if (!carregado) {
    return NextResponse.json(
      { error: "Pedido não encontrado ou ainda não fechado." },
      { status: 404 }
    );
  }
  const { empresa, pedido } = carregado;

  // Precisa existir um número conectado ANTES de gerar imagem e subir pro R2 —
  // senão a gente gasta o trabalho todo pra descobrir no fim que não há por
  // onde enviar, e deixa um arquivo órfão no bucket.
  // Recibo sai pela linha de quem está enviando — na Guttierres, a do
  // financeiro. Ver lib/whatsapp-sessions.
  const session = await numeroParaEnviar(user);
  if (!session) {
    return NextResponse.json({ error: "Nenhum número de WhatsApp conectado." }, { status: 400 });
  }

  // Salva antes de desenhar: o comprovante que sai já leva o que a pessoa
  // acabou de digitar, e os próximos pedidos deste cliente vêm preenchidos.
  const cliente = resolverDadosDoCliente(pedido.contact, corpo);
  if (
    cliente.documento !== pedido.contact.documento ||
    cliente.nomeNoRecibo !== pedido.contact.nomeNoRecibo
  ) {
    await prisma.contact.update({ where: { id: pedido.contact.id }, data: cliente });
  }

  const mesReferencia = resolverMesReferencia(pedido, corpo);
  if (mesReferencia !== pedido.mesReferencia) {
    await prisma.order.update({ where: { id: pedido.id }, data: { mesReferencia } });
  }

  const recibo = montarReciboDoPedido(empresa, { ...pedido, mesReferencia }, cliente);
  const png = await desenharReciboPng(recibo, empresa.reciboLogoKey);

  const mediaKey = `${user.tenantId}/recibos/${pedido.id}-${randomUUID().slice(0, 8)}.png`;
  await uploadMedia(mediaKey, png, "image/png");

  let conversationId = pedido.conversationId;
  if (!conversationId) {
    const conv = await prisma.conversation.upsert({
      where: { contactId_sessionId: { contactId: pedido.contact.id, sessionId: session.id } },
      update: {},
      create: { tenantId: user.tenantId, contactId: pedido.contact.id, sessionId: session.id },
    });
    conversationId = conv.id;
  }

  const conversa = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { setorId: true },
  });

  await prisma.message.create({
    data: {
      conversationId,
      sessionId: session.id,
      direction: "OUTBOUND",
      status: "PENDING",
      body: `Comprovante do pedido #${pedido.numero}`,
      senderUserId: user.id,
      mediaType: "IMAGE",
      mediaKey,
      mediaMimeType: "image/png",
      mediaFileName: `recibo-${pedido.numero}.png`,
      setorId: conversa.setorId,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  await wakeOutbox(user.tenantId);

  return NextResponse.json({ ok: true });
}
