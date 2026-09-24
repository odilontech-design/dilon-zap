import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";

const MAX_SIZE_BYTES = 16 * 1024 * 1024; // mesmo teto do anexo do Inbox

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

/**
 * Anexo do chat interno. Mesmo teto e mesmo bucket do anexo do Inbox, mas
 * sem a conversão de áudio pra ogg/opus (ver lib/audio-transcode.ts): aquilo
 * existe só porque o WhatsApp exige o formato certo pra nota de voz, e aqui
 * dentro não tem WhatsApp — o arquivo só precisa tocar/abrir na própria tela.
 */
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
  const setorIdRaw = form.get("setorId");
  const setorId = typeof setorIdRaw === "string" && setorIdRaw ? setorIdRaw : null;
  const destinatarioRaw = form.get("destinatarioId");
  const destinatarioId = typeof destinatarioRaw === "string" && destinatarioRaw ? destinatarioRaw : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "arquivo maior que 16MB" }, { status: 400 });
  }

  if (destinatarioId) {
    // Conversa direta: o colega precisa existir, ser da empresa e estar ativo.
    const colega = await prisma.user.findFirst({
      where: { id: destinatarioId, tenantId: user.tenantId, deactivatedAt: null, NOT: { id: user.id } },
      select: { id: true },
    });
    if (!colega) return NextResponse.json({ error: "colega não encontrado" }, { status: 404 });
  } else {
    const membros = await prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } });
    if (!podeVerCanal(user.role, membros.map((m) => m.setorId), setorId)) {
      return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
    }
  }

  const mimeType = file.type || "application/octet-stream";
  const mediaType = classify(mimeType);
  const key = `${user.tenantId}/chat-equipe/${destinatarioId ? "direta" : (setorId ?? "geral")}/${randomUUID()}${extensionFor(file.name, mimeType)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadMedia(key, buffer, mimeType);

  return NextResponse.json({
    mediaKey: key,
    mediaType,
    mediaMimeType: mimeType,
    mediaFileName: file.name || undefined,
  });
}
