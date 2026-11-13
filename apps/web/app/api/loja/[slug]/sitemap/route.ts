import { carrosDaVitrine, lojaPublica } from "@/lib/vitrine";
import { sitemapDaLoja } from "@/lib/vitrine-seo";

/** Sitemap da vitrine, com datas e fotos (no domínio próprio, servido em /sitemap.xml pelo middleware). */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return new Response("não encontrada", { status: 404 });
  return new Response(sitemapDaLoja(loja, await carrosDaVitrine(loja)), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
