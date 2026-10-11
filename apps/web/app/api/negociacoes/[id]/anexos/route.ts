import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, deleteMedia, getMediaReadUrl, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";

/**
 * Arquivos da negociação: proposta, contrato, orçamento, print de conversa.
 * Pedido da Believe (reunião de 10/10): "no CRM, campo para anexar arquivos".
 */

// Proposta em PDF e foto de documento cabem com folga; o teto impede subir
// vídeo pesado por aqui (vídeo de produto vai na biblioteca de Materiais).
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

async function daEmpresa(id: string, tenantId: string) {
  return prisma.negociacao.findFirst({ where: { id, tenantId }, select: { id: true } });
}

/**
 * GET ?anexo=… — redireciona pra uma URL assinada. Com &baixar=1 o navegador
 * baixa com o nome original; sem, abre (PDF e imagem abrem na própria aba).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const anexo = await prisma.negociacaoAnexo.findFirst({
    where: { id: q.get("anexo") ?? "", negociacaoId: params.id, tenantId: user.tenantId },
    select: { mediaKey: true, nome: true },
  });
  if (!anexo) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  return NextResponse.redirect(await getMediaReadUrl(anexo.mediaKey, 600, q.get("baixar") ? anexo.nome : undefined));
}

/** POST multipart (file) — anexa um arquivo. Qualquer um que veja a negociação. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });
  }
  const n = await daEmpresa(params.id, user.tenantId);
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "arquivo vazio" }, { status: 400 });
  if (file.size > TAMANHO_MAXIMO) return NextResponse.json({ error: "arquivo maior que 20MB" }, { status: 400 });

  const nome = (file.name || "arquivo").slice(0, 200);
  const extensao = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")).toLowerCase().replace(/[^.\w]/g, "") : "";
  const mimeType = file.type || "application/octet-stream";
  const key = `${user.tenantId}/negociacoes/${n.id}/${randomUUID()}${extensao}`;
  await uploadMedia(key, Buffer.from(await file.arrayBuffer()), mimeType);

  const anexo = await prisma.negociacaoAnexo.create({
    data: {
      tenantId: user.tenantId,
      negociacaoId: n.id,
      nome,
      mediaKey: key,
      mimeType,
      tamanhoBytes: file.size,
      porUserId: user.id,
      porNome: user.name,
    },
    select: { id: true, nome: true, mimeType: true, tamanhoBytes: true, porUserId: true, porNome: true, criadoEm: true },
  });
  await prisma.negociacao.update({ where: { id: n.id }, data: { updatedAt: new Date() } });
  return NextResponse.json(anexo);
}

/** DELETE ?anexo=… — quem anexou ou a gestão. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const anexo = await prisma.negociacaoAnexo.findFirst({
    where: { id: new URL(req.url).searchParams.get("anexo") ?? "", negociacaoId: params.id, tenantId: user.tenantId },
    select: { id: true, mediaKey: true, nome: true, porUserId: true },
  });
  if (!anexo) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  if (anexo.porUserId !== user.id && !ehGerencia(user.role)) {
    return NextResponse.json({ error: "só quem anexou ou a gestão apagam" }, { status: 403 });
  }
  await prisma.negociacaoAnexo.delete({ where: { id: anexo.id } });
  await deleteMedia(anexo.mediaKey).catch(() => {});
  await logAudit({ actor: user, action: "negociacao.anexo.remover", metadata: { negociacaoId: params.id, nome: anexo.nome } });
  return NextResponse.json({ ok: true });
}
