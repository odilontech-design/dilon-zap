import { NextResponse } from "next/server";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { fotoDaVitrine, lojaPublica } from "@/lib/vitrine";

/**
 * Foto pública da vitrine, sem login. Só responde para foto de carro que a
 * vitrine mostra (loja com vitrine ligada, carro disponível e na vitrine):
 * vendeu ou saiu da vitrine, o link antigo para de funcionar.
 */
export async function GET(_req: Request, { params }: { params: { slug: string; fotoId: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const foto = await fotoDaVitrine(loja, params.fotoId);
  if (!foto) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const res = NextResponse.redirect(await getMediaReadUrl(foto.key, 3600));
  // Público, mas curto: a URL assinada expira em 1 hora.
  res.headers.set("Cache-Control", "public, max-age=600");
  return res;
}
