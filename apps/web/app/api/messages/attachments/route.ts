import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { transcodeParaOggOpus } from "@/lib/audio-transcode";
import { limiteDoAnexo, mensagemDeTamanho } from "@/lib/anexo-limite";

function classify(mimeType: string): "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO" {
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "DOCUMENT";
}

function extensionFor(fileName: string, mimeType: string) {
  const fromName = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  if (fromName) return fromName;
  const subtype = mimeType.split(";")[0]?.split("/")[1];
  return subtype ? `.${subtype}` : "";
}

export async function POST(req: Request) {
  const user = await requireUser();

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage de mídia ainda não configurado (credenciais do R2 no .env)." },
      { status: 503 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const conversationId = form.get("conversationId");

  if (!(file instanceof File) || typeof conversationId !== "string") {
    return NextResponse.json({ error: "arquivo e conversationId são obrigatórios" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mimeTypeOriginal = file.type || "application/octet-stream";
  const mediaType = classify(mimeTypeOriginal);
  // Mídia segue o teto de 16MB do WhatsApp; documento (PDF etc.) vai até 50MB.
  if (file.size > limiteDoAnexo(mediaType)) {
    return NextResponse.json({ error: mensagemDeTamanho(mediaType) }, { status: 400 });
  }
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = mimeTypeOriginal;
  let extensao = extensionFor(file.name, mimeTypeOriginal);
  let durationSeconds: number | undefined;

  if (mediaType === "AUDIO") {
    // Todo áudio sai como nota de voz (ver sendOutboundMedia no worker), e o
    // WhatsApp só reconhece nota de voz em ogg/opus de verdade — não basta
    // rotular. Sem isso o áudio "enviava" e nunca chegava do outro lado (foi
    // o que a Guttierres relatou em 23/09).
    try {
      const convertido = await transcodeParaOggOpus(buffer);
      buffer = convertido.buffer;
      mimeType = "audio/ogg; codecs=opus";
      extensao = ".ogg";
      durationSeconds = convertido.durationSeconds ?? undefined;
    } catch (err) {
      console.error("falha ao converter áudio pra ogg/opus", err);
      return NextResponse.json(
        { error: "não deu pra processar esse áudio. Tenta gravar de novo ou envie outro arquivo." },
        { status: 422 }
      );
    }
  }

  const key = `${user.tenantId}/${conversation.id}/${randomUUID()}${extensao}`;
  await uploadMedia(key, buffer, mimeType);

  return NextResponse.json({
    mediaKey: key,
    mediaType,
    mediaMimeType: mimeType,
    mediaFileName: file.name || undefined,
    durationSeconds,
  });
}
