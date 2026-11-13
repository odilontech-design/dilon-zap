import { carrosDaVitrine, lojaPublica } from "@/lib/vitrine";
import { llmsTxtDaLoja } from "@/lib/vitrine-seo";

/** llms.txt da loja (no domínio próprio, servido em /llms.txt pelo middleware): o estoque em texto para as IAs. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return new Response("não encontrada", { status: 404 });
  return new Response(llmsTxtDaLoja(loja, await carrosDaVitrine(loja)), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
