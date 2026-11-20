import { NextResponse } from "next/server";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { fotoDaVitrine, lojaPublica } from "@/lib/vitrine";
import { larguraPermitida, variante } from "@/lib/foto-variantes";

export const runtime = "nodejs";

/**
 * Foto pública da vitrine, sem login. Só responde para foto de carro que a
 * vitrine mostra (loja com vitrine ligada, carro disponível e na vitrine):
 * vendeu ou saiu da vitrine, o link antigo para de funcionar.
 *
 * Com `?w=480` (240, 480, 800 ou 1200) devolve a versão leve em WebP, que é o
 * que a vitrine usa; sem `w`, redireciona para a original (portais, feeds, Google Imagens).
 */
export async function GET(req: Request, { params }: { params: { slug: string; fotoId: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const foto = await fotoDaVitrine(loja, params.fotoId);
  if (!foto) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  const largura = larguraPermitida(new URL(req.url).searchParams.get("w"));
  if (largura) {
    try {
      const corpo = await variante(foto.key, largura);
      // O conteúdo de uma foto não muda (id novo a cada foto): cache longo no navegador.
      return new Response(new Uint8Array(corpo), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", "Content-Length": String(corpo.length) } });
    } catch {
      // Falhou ao redimensionar (arquivo estranho, memória): cai para a original.
    }
  }
  const res = NextResponse.redirect(await getMediaReadUrl(foto.key, 3600));
  // Público, mas curto: a URL assinada expira em 1 hora.
  res.headers.set("Cache-Control", "public, max-age=600");
  return res;
}
