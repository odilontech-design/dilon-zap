import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { deleteMedia, downloadMedia, getMediaReadUrl } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/** A foto, por redirecionamento para a URL assinada do R2 (como a foto de produto). */
export async function GET(req: Request, { params }: { params: { fotoId: string } }) {
  const user = await requireUser();
  const foto = await prisma.fotoVeiculo.findFirst({ where: { id: params.fotoId, tenantId: user.tenantId }, select: { key: true } });
  if (!foto) return NextResponse.json({ error: "foto não encontrada" }, { status: 404 });
  // `?baixar=1`: devolve os bytes pelo próprio servidor. O "Baixar fotos" do menu do carro monta o .zip no navegador, e ler
  // direto do R2 (outro domínio) exigiria liberar CORS no bucket. Só roda quando alguém clica em baixar.
  if (new URL(req.url).searchParams.get("baixar") === "1") {
    const bytes = await downloadMedia(foto.key);
    const ext = foto.key.split(".").pop()?.toLowerCase();
    const tipo = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": tipo, "Cache-Control": "private, no-store" } });
  }
  const res = NextResponse.redirect(await getMediaReadUrl(foto.key));
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}

export async function DELETE(_req: Request, { params }: { params: { fotoId: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const foto = await prisma.fotoVeiculo.findFirst({ where: { id: params.fotoId, tenantId: user.tenantId }, select: { id: true, key: true } });
  if (!foto) return NextResponse.json({ error: "foto não encontrada" }, { status: 404 });
  await prisma.fotoVeiculo.delete({ where: { id: foto.id } });
  // Mensagem já enviada no WhatsApp aponta para a mesma chave (o Inbox mostra
  // a mídia dela). Apagar o arquivo deixaria a conversa com imagem quebrada.
  const usada = await prisma.message.findFirst({ where: { mediaKey: foto.key }, select: { id: true } });
  if (!usada) await deleteMedia(foto.key).catch(() => {});
  return NextResponse.json({ ok: true });
}
