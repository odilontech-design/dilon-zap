import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { wakeOutbox } from "@/lib/worker-client";

const bodySchema = z.object({ materialId: z.string().min(1) });

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
  const bloqueio = await exigirRecurso(user, "MATERIAIS");
  if (bloqueio) return bloqueio;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "materialId é obrigatório" }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const material = await prisma.produtoMaterial.findFirst({
    where: { id: parsed.data.materialId, tenantId: user.tenantId },
  });
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
