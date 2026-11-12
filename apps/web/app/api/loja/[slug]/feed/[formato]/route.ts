import { NextResponse } from "next/server";
import { feedJson, feedMetaCsv, feedXml, type CarroDoFeed } from "@/lib/feeds-estoque";
import { baseDaLoja, carrosDaVitrine, linkDoCarro, lojaPublica } from "@/lib/vitrine";

/**
 * Feeds públicos do estoque da vitrine:
 *   /api/loja/[slug]/feed/facebook.csv  catálogo de veículos da Meta (Facebook e Instagram)
 *   /api/loja/[slug]/feed/estoque.xml   XML genérico para integradores
 *   /api/loja/[slug]/feed/estoque.json  o mesmo em JSON
 *
 * Mostram exatamente o que a vitrine mostra (nada interno) e só existem com a
 * vitrine no ar.
 */
export async function GET(_req: Request, { params }: { params: { slug: string; formato: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  if (!["facebook.csv", "estoque.xml", "estoque.json"].includes(params.formato)) return NextResponse.json({ error: "formato desconhecido" }, { status: 404 });
  // O catálogo da Meta é do plano Revenda para cima.
  if (params.formato === "facebook.csv" && !loja.catalogoMeta) return NextResponse.json({ error: "catálogo não incluído no plano da loja" }, { status: 404 });

  const base = baseDaLoja(loja.dominio);
  const agora = new Date();
  const carros: CarroDoFeed[] = (await carrosDaVitrine(loja)).map((c) => ({
    id: c.id,
    marca: c.marca,
    modelo: c.modelo,
    versao: c.versao,
    anoFabricacao: c.anoFabricacao,
    anoModelo: c.anoModelo,
    km: c.km,
    cor: c.cor,
    combustivel: c.combustivel,
    cambio: c.cambio,
    portas: c.portas,
    opcionais: c.opcionais,
    precoCents: c.precoCents,
    descricao: c.descricao,
    status: c.status,
    diasEmEstoque: Math.max(0, Math.floor((agora.getTime() - c.entradaEm.getTime()) / 86_400_000)),
    url: linkDoCarro(loja.slug, c.id, loja.dominio),
    fotos: c.fotos.map((f) => `${base}/api/loja/${loja.slug}/fotos/${f.id}`),
  }));
  const dadosLoja = { nome: loja.nome, endereco: loja.endereco };
  const cache = { "Cache-Control": "public, max-age=900" };

  if (params.formato === "facebook.csv") return new Response(feedMetaCsv(dadosLoja, carros), { headers: { "Content-Type": "text/csv; charset=utf-8", ...cache } });
  if (params.formato === "estoque.xml") return new Response(feedXml(dadosLoja, carros, agora), { headers: { "Content-Type": "application/xml; charset=utf-8", ...cache } });
  return NextResponse.json(feedJson(dadosLoja, carros, agora), { headers: cache });
}
