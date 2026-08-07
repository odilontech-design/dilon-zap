import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const MAX_SIZE_BYTES = 16 * 1024 * 1024; // 16MB — mesmo teto que o WhatsApp usa pra mídia

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
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "arquivo maior que 16MB" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: user.tenantId, ...conversationVisibilityWhere(user) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mimeType = file.type || "application/octet-stream";
  const mediaType = classify(mimeType);
  const key = `${user.tenantId}/${conversation.id}/${randomUUID()}${extensionFor(file.name, mimeType)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadMedia(key, buffer, mimeType);

  return NextResponse.json({
    mediaKey: key,
    mediaType,
    mediaMimeType: mimeType,
    mediaFileName: file.name || undefined,
  });
}
