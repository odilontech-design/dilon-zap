import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, type MediaType } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { wakeOutbox } from "@/lib/worker-client";

const bodySchema = z.union([
  z.object({ materialId: z.string().min(1) }),
  // Foto do catálogo: vai com nome e preço na legenda.
  z.object({ fotoDoProduto: z.string().min(1) }),
]);

const MIME_POR_EXTENSAO: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * POST /api/conversations/[id]/materiais — manda um arquivo da biblioteca
 * pro cliente.
 *
 * Rota própria, e não /api/messages/send, porque lá quem diz qual arquivo
 * mandar é o navegador (a mediaKey vem no corpo). Aqui o navegador só diz
 * QUAL material, e o servidor acha o arquivo — filtrando pela empresa. Sem
 * isso, dava pra mandar arquivo da biblioteca de outra empresa chutando a
 * chave.
 *
 * Mesma fila do envio comum: grava como PENDING e o worker manda.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["MATERIAIS", "PEDIDOS"]);
  if (bloqueio) return bloqueio;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "diga qual material mandar" }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  let material: {
    titulo: string;
    mediaType: MediaType;
    mediaKey: string;
    mimeType: string;
    fileName: string;
    duracaoSegundos: number | null;
  } | null;

  if ("fotoDoProduto" in parsed.data) {
    const produto = await prisma.product.findFirst({
      where: { id: parsed.data.fotoDoProduto, tenantId: user.tenantId },
      select: { name: true, priceCents: true, fotoKey: true },
    });
    if (!produto?.fotoKey) return NextResponse.json({ error: "produto sem foto" }, { status: 404 });
    const extensao = produto.fotoKey.slice(produto.fotoKey.lastIndexOf(".") + 1);
    material = {
      titulo: `${produto.name} — ${brl(produto.priceCents)}`,
      mediaType: "IMAGE",
      mediaKey: produto.fotoKey,
      mimeType: MIME_POR_EXTENSAO[extensao] ?? "image/jpeg",
      fileName: `${produto.name}.${extensao}`,
      duracaoSegundos: null,
    };
  } else {
    material = await prisma.produtoMaterial.findFirst({
      where: { id: parsed.data.materialId, tenantId: user.tenantId },
    });
    // A biblioteca de arquivos continua sendo do recurso Materiais.
    if (material) {
      const semBiblioteca = await exigirAlgumRecurso(user, ["MATERIAIS"]);
      if (semBiblioteca) return semBiblioteca;
    }
  }
  if (!material) return NextResponse.json({ error: "material não encontrado" }, { status: 404 });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sessionId: conversation.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      // Documento vai sem legenda (o nome do arquivo já aparece no WhatsApp);
      // imagem e vídeo levam o título, que é o que explica do que se trata.
      body: material.mediaType === "DOCUMENT" ? "" : material.titulo,
      senderUserId: user.id,
      mediaType: material.mediaType,
      mediaKey: material.mediaKey,
      mediaMimeType: material.mimeType,
      mediaFileName: material.fileName,
      mediaDurationSeconds: material.duracaoSegundos ?? undefined,
      setorId: conversation.setorId,
    },
  });

  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  await wakeOutbox(user.tenantId);

  return NextResponse.json(message);
}
