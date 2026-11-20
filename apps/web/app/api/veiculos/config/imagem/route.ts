import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { deleteMedia, isStorageConfigured, uploadMedia } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";
import { configDaRevenda } from "@/lib/vitrine";

/**
 * Logo e banner da vitrine. Só PNG, JPG ou WEBP: SVG fica de fora de propósito
 * (um SVG pode carregar script, e a imagem é servida num endereço público).
 * O arquivo vai para o R2; a vitrine lê por /api/loja/[slug]/marca/[logo|banner].
 */

const LIMITES = { logo: 3 * 1024 * 1024, banner: 6 * 1024 * 1024 } as const;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

async function gestao() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: SEM_PERMISSAO() };
  return { user };
}

export async function POST(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  if (!isStorageConfigured()) return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const tipo = form?.get("tipo");
  const arquivo = form?.get("file");
  if ((tipo !== "logo" && tipo !== "banner") || !(arquivo instanceof File)) return NextResponse.json({ error: "envie o tipo (logo ou banner) e o arquivo" }, { status: 400 });
  if (!TIPOS.includes(arquivo.type)) return NextResponse.json({ error: "use PNG, JPG ou WEBP" }, { status: 400 });
  if (arquivo.size > LIMITES[tipo]) return NextResponse.json({ error: `a imagem passa de ${LIMITES[tipo] / 1024 / 1024}MB` }, { status: 400 });

  const cfg = await configDaRevenda(user.tenantId);
  const antiga = tipo === "logo" ? cfg.logoKey : cfg.bannerKey;
  const ext = arquivo.type.split("/")[1].replace("jpeg", "jpg");
  const key = `${user.tenantId}/vitrine/${tipo}-${randomUUID().slice(0, 12)}.${ext}`;
  await uploadMedia(key, Buffer.from(await arquivo.arrayBuffer()), arquivo.type);
  await prisma.veiculosConfig.update({ where: { tenantId: user.tenantId }, data: tipo === "logo" ? { logoKey: key } : { bannerKey: key } });
  if (antiga) await deleteMedia(antiga).catch(() => {});
  await logAudit({ actor: user, action: "veiculos.config.imagem", metadata: { tipo } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const tipo = new URL(req.url).searchParams.get("tipo");
  if (tipo !== "logo" && tipo !== "banner") return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  const cfg = await configDaRevenda(user.tenantId);
  const key = tipo === "logo" ? cfg.logoKey : cfg.bannerKey;
  await prisma.veiculosConfig.update({ where: { tenantId: user.tenantId }, data: tipo === "logo" ? { logoKey: null } : { bannerKey: null } });
  if (key) await deleteMedia(key).catch(() => {});
  return NextResponse.json({ ok: true });
}
