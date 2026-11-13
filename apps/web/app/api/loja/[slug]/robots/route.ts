import { lojaPublica } from "@/lib/vitrine";
import { robotsDaLoja } from "@/lib/vitrine-seo";

/** robots.txt do domínio próprio: libera a vitrine, as fotos e os rastreadores de IA, e aponta o sitemap. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return new Response(robotsDaLoja(await lojaPublica(params.slug)), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
