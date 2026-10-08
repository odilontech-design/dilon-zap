import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, deleteMedia, getMediaReadUrl, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { ehGerencia } from "@/lib/papeis";

/**
 * Logo da empresa no recibo.
 *
 * Mesma ideia das mídias da conversa: o arquivo vive no R2 e o banco guarda só
 * a chave. O GET redireciona pra uma URL assinada em vez de servir o arquivo,
 * pra não passar as credenciais do bucket pelo navegador.
 */

// Logo é desenhada com no máximo ~150px de largura no recibo. 2MB já é folga
// generosa pra um PNG nessa escala, e o teto evita que alguém suba a foto
// original de 20MB da identidade visual.
const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

function podeEditar(role: string) {
  return ehGerencia(role);
}

export async function GET() {
  const user = await requireUser();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { reciboLogoKey: true },
  });
  if (!tenant.reciboLogoKey) return NextResponse.json({ error: "sem logo" }, { status: 404 });
  return NextResponse.redirect(await getMediaReadUrl(tenant.reciboLogoKey));
}

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;
  if (!podeEditar(user.role)) {
    return NextResponse.json({ error: "só o responsável ou o financeiro mudam o recibo" }, { status: 403 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage de mídia não configurado." }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });
  }
  if (file.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "imagem maior que 2MB" }, { status: 400 });
  }
  if (!TIPOS.includes(file.type)) {
    return NextResponse.json({ error: "use PNG, JPG ou WEBP" }, { status: 400 });
  }

  const anterior = (
    await prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { reciboLogoKey: true },
    })
  ).reciboLogoKey;

  const extensao = file.type.split("/")[1].replace("jpeg", "jpg");
  const key = `${user.tenantId}/recibo/logo-${randomUUID().slice(0, 8)}.${extensao}`;
  await uploadMedia(key, Buffer.from(await file.arrayBuffer()), file.type);

  await prisma.tenant.update({ where: { id: user.tenantId }, data: { reciboLogoKey: key } });

  // Só apaga a antiga DEPOIS de a nova estar gravada: se a ordem fosse outra e
  // o upload falhasse no meio, a empresa ficaria sem logo nenhuma.
  if (anterior) await deleteMedia(anterior).catch(() => {});

  await logAudit({ actor: user, action: "recibo.logo", metadata: { key } });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;
  if (!podeEditar(user.role)) {
    return NextResponse.json({ error: "só o responsável ou o financeiro mudam o recibo" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { reciboLogoKey: true },
  });
  if (tenant.reciboLogoKey) {
    await prisma.tenant.update({ where: { id: user.tenantId }, data: { reciboLogoKey: null } });
    await deleteMedia(tenant.reciboLogoKey).catch(() => {});
    await logAudit({ actor: user, action: "recibo.logo.remover", metadata: {} });
  }
  return NextResponse.json({ ok: true });
}
