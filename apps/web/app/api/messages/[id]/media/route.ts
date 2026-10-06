import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

// Nunca expomos a mediaKey nem as credenciais do R2 pro navegador — esse
// endpoint confere que a mensagem é do tenant logado (e visível pro papel
// dele) e redireciona pra uma URL assinada de leitura, válida por 1h.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) } },
    select: { mediaKey: true, mediaFileName: true, mediaType: true },
  });
  if (!message?.mediaKey) return NextResponse.json({ error: "not found" }, { status: 404 });

  // ?download=1 salva em vez de abrir — é o botão de baixar do visualizador.
  const baixar = new URL(req.url).searchParams.get("download") === "1";
  const nome = baixar
    ? message.mediaFileName?.trim() || nomePadrao(message.mediaType, message.mediaKey)
    : undefined;

  const url = await getMediaReadUrl(message.mediaKey, 3600, nome);
  return NextResponse.redirect(url);
}

/**
 * Nome pra quem chegou sem nome — o que é a regra, não a exceção: print colado
 * e foto tirada na hora chegam do WhatsApp sem nome de arquivo. Sem isto o
 * navegador salvaria com o id do objeto no bucket, e a pasta de downloads
 * viraria uma lista de códigos.
 */
function nomePadrao(tipo: string | null, chave: string) {
  const extensao = chave.includes(".") ? chave.slice(chave.lastIndexOf(".")) : "";
  const prefixo = tipo === "IMAGE" ? "imagem" : tipo === "VIDEO" ? "video" : tipo === "AUDIO" ? "audio" : "arquivo";
  return `${prefixo}-dilon-zap${extensao}`;
}
