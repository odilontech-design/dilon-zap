import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, deleteMedia, getMediaReadUrl, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { ehGerencia } from "@/lib/papeis";

/**
 * Foto do produto: aparece no catálogo, no pedido e pode ser enviada na
 * conversa. Pedido da Believe (reunião de 10/10): "catálogo trazer fotos".
 *
 * Mesmo desenho da logo do recibo — o arquivo vive no R2, o banco guarda a
 * chave e o GET redireciona pra uma URL assinada.
 */

// Foto de catálogo é vista em miniatura e no WhatsApp; 5MB cobre a foto de
// celular sem deixar subir o arquivo original da sessão de fotos.
const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

async function produtoDoTenant(id: string, tenantId: string) {
  return prisma.product.findFirst({ where: { id, tenantId }, select: { id: true, fotoKey: true } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const produto = await produtoDoTenant(params.id, user.tenantId);
  if (!produto?.fotoKey) return NextResponse.json({ error: "sem foto" }, { status: 404 });
  const res = NextResponse.redirect(await getMediaReadUrl(produto.fotoKey));
  // A URL assinada expira; o navegador pode guardar o redirecionamento por
  // pouco tempo, nunca mais que a assinatura.
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });
  }

  const produto = await produtoDoTenant(params.id, user.tenantId);
  if (!produto) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });
  if (file.size > TAMANHO_MAXIMO) return NextResponse.json({ error: "imagem maior que 5MB" }, { status: 400 });
  if (!TIPOS.includes(file.type)) return NextResponse.json({ error: "use PNG, JPG ou WEBP" }, { status: 400 });

  const extensao = file.type.split("/")[1].replace("jpeg", "jpg");
  const key = `${user.tenantId}/produtos/${produto.id}/foto-${randomUUID().slice(0, 8)}.${extensao}`;
  await uploadMedia(key, Buffer.from(await file.arrayBuffer()), file.type);
  await prisma.product.update({ where: { id: produto.id }, data: { fotoKey: key } });

  // Só apaga a antiga depois de a nova estar gravada.
  if (produto.fotoKey) await deleteMedia(produto.fotoKey).catch(() => {});

  await logAudit({ actor: user, action: "product.foto", metadata: { productId: produto.id } });
  return NextResponse.json({ ok: true, fotoKey: key });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const produto = await produtoDoTenant(params.id, user.tenantId);
  if (!produto) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
  if (produto.fotoKey) {
    await prisma.product.update({ where: { id: produto.id }, data: { fotoKey: null } });
    await deleteMedia(produto.fotoKey).catch(() => {});
    await logAudit({ actor: user, action: "product.foto.remover", metadata: { productId: produto.id } });
  }
  return NextResponse.json({ ok: true });
}
