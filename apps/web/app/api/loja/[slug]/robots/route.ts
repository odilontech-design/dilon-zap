import { baseDaLoja, lojaPublica } from "@/lib/vitrine";

/** robots.txt do domínio próprio: libera a vitrine e aponta o sitemap. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
  const sitemap = loja.dominio ? `${baseDaLoja(loja.dominio)}/sitemap.xml` : `${baseDaLoja(null)}/api/loja/${loja.slug}/sitemap`;
  return new Response(`User-agent: *\nAllow: /loja/\nDisallow: /api/\n\nSitemap: ${sitemap}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
