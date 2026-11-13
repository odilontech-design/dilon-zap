import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, deleteMedia, getMediaReadUrl, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { LIMITE_FOTO_BYTES, TIPOS_DE_FOTO } from "@/lib/otica-leitura";

/**
 * A foto do talão de papel de uma OS (a OS escaneada). O arquivo vive no R2; o
 * banco guarda só a chave, e o GET redireciona para uma URL assinada, como a
 * foto do produto. Só a empresa dona da OS enxerga.
 */
async function ordemDoTenant(id: string, tenantId: string) {
  return prisma.ordemServico.findFirst({ where: { id, tenantId }, select: { id: true, numero: true, fotoKey: true } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  const ordem = await ordemDoTenant(params.id, user.tenantId);
  if (!ordem?.fotoKey) return NextResponse.json({ error: "esta OS não tem foto" }, { status: 404 });
  const res = NextResponse.redirect(await getMediaReadUrl(ordem.fotoKey));
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!isStorageConfigured()) return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });

  const ordem = await ordemDoTenant(params.id, user.tenantId);
  if (!ordem) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "envie a foto no campo foto" }, { status: 400 });
  if (!TIPOS_DE_FOTO.includes(foto.type)) return NextResponse.json({ error: "use uma foto JPG, PNG ou WEBP" }, { status: 400 });
  if (foto.size > LIMITE_FOTO_BYTES) return NextResponse.json({ error: "a foto passa de 8 MB" }, { status: 400 });

  const extensao = foto.type.split("/")[1].replace("jpeg", "jpg");
  const key = `${user.tenantId}/otica/os/${ordem.id}/talao-${randomUUID().slice(0, 8)}.${extensao}`;
  await uploadMedia(key, Buffer.from(await foto.arrayBuffer()), foto.type);
  await prisma.ordemServico.update({ where: { id: ordem.id }, data: { fotoKey: key } });
  // Só apaga a antiga depois de a nova estar gravada.
  if (ordem.fotoKey) await deleteMedia(ordem.fotoKey).catch(() => {});

  await logAudit({ actor: user, action: "otica.os.foto", metadata: { ordemId: ordem.id, numero: ordem.numero } });
  return NextResponse.json({ ok: true });
}
