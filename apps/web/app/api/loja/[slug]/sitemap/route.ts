import { carrosDaVitrine, linkDaLoja, linkDoCarro, lojaPublica } from "@/lib/vitrine";

/** Sitemap da vitrine (no domínio próprio, servido em /sitemap.xml pelo middleware). */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return new Response("não encontrada", { status: 404 });
  const carros = await carrosDaVitrine(loja);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [linkDaLoja(loja.slug, loja.dominio), ...carros.map((c) => linkDoCarro(loja.slug, c.id, loja.dominio))];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
