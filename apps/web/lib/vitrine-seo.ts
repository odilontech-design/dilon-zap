import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import type { CarroPublico, LojaPublica } from "@/lib/vitrine";
import { baseDaLoja, linkDaLoja, linkDoCarro } from "@/lib/vitrine";
import { PAGINAS, caminhoDaLoja } from "@/lib/vitrine-aparencia";

/**
 * Tudo que ajuda a vitrine a ser achada e bem entendida: pelo Google (títulos,
 * descrições, sitemap com imagens) e pelas IAs (llms.txt, robots que as
 * convida). Funções puras: recebem a loja e os carros, devolvem texto.
 */

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Rastreadores de IA e de busca que a vitrine convida (a loja quer ser achada, não ficar de fora). */
export const ROBOS_DE_IA = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Claude-User", "Google-Extended", "Applebot-Extended", "Bingbot"];

const NOME_DA_PAGINA: Record<(typeof PAGINAS)[number], string> = {
  "venda-seu-carro": "Venda seu carro",
  financiamento: "Simule o financiamento",
  localizacao: "Como chegar",
  privacidade: "Política de privacidade",
};

/** "Honda Civic EXL 2017/2018 por R$ 90.000 | Sales Automóveis": o que aparece como título no Google. */
export function tituloDoCarro(c: CarroPublico, loja: Pick<LojaPublica, "nome">): string {
  return `${nomeDoVeiculo(c)} por ${brl(c.precoCents)} | ${loja.nome}`.slice(0, 110);
}

/** Descrição de ~155 caracteres com o que o comprador procura: ano, km, câmbio, combustível, cor e a chamada. */
export function descricaoDoCarro(c: CarroPublico, loja: Pick<LojaPublica, "nome" | "endereco">): string {
  const partes = [
    `${c.marca} ${c.modelo} ${c.anoFabricacao}/${c.anoModelo} usado`,
    c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : null,
    c.cambio,
    c.combustivel,
    c.cor,
  ].filter(Boolean);
  return `${partes.join(", ")}. ${brl(c.precoCents)}. Veja fotos, ficha completa e simule o financiamento na ${loja.nome}.`.slice(0, 200);
}

function enderecoDasPaginas(loja: LojaPublica) {
  return PAGINAS.map((p) => ({ nome: NOME_DA_PAGINA[p], url: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, p)}` }));
}

export function robotsDaLoja(loja: LojaPublica | null): string {
  if (!loja) return "User-agent: *\nDisallow: /\n";
  const sitemap = loja.dominio ? `${baseDaLoja(loja.dominio)}/sitemap.xml` : `${baseDaLoja(null)}/api/loja/${loja.slug}/sitemap`;
  // As fotos moram em /api/loja/<slug>/fotos: liberadas para o Google Imagens e as IAs verem os carros.
  const regras = "Allow: /\nAllow: /api/loja/*/fotos/\nAllow: /api/loja/*/marca/\nAllow: /api/loja/*/llms\nDisallow: /api/\n";
  return `User-agent: *\n${regras}\n${ROBOS_DE_IA.map((r) => `User-agent: ${r}`).join("\n")}\n${regras}\nSitemap: ${sitemap}\n`;
}

/** Sitemap com data de atualização e as fotos de cada carro (Google Imagens). */
export function sitemapDaLoja(loja: LojaPublica, carros: (CarroPublico & { updatedAt?: Date })[]): string {
  const base = baseDaLoja(loja.dominio);
  const item = (url: string, extra = "") => `  <url><loc>${esc(url)}</loc>${extra}</url>`;
  const linhas = [
    item(linkDaLoja(loja.slug, loja.dominio), "<changefreq>daily</changefreq><priority>1.0</priority>"),
    ...enderecoDasPaginas(loja).map((p) => item(p.url, "<changefreq>monthly</changefreq><priority>0.5</priority>")),
    ...carros.map((c) => {
      const fotos = c.fotos.slice(0, 20).map((f) => `<image:image><image:loc>${esc(`${base}/api/loja/${loja.slug}/fotos/${f.id}`)}</image:loc><image:title>${esc(nomeDoVeiculo(c))}</image:title></image:image>`).join("");
      const mod = c.updatedAt ? `<lastmod>${c.updatedAt.toISOString()}</lastmod>` : "";
      return item(linkDoCarro(loja.slug, c.id, loja.dominio), `${mod}<changefreq>weekly</changefreq><priority>0.8</priority>${fotos}`);
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${linhas.join("\n")}\n</urlset>\n`;
}

/**
 * llms.txt: o resumo da loja e do estoque em texto limpo, para ChatGPT, Gemini,
 * Perplexity e afins responderem "onde comprar um Civic 2018 em Caxias" com os
 * carros e links reais da loja.
 */
export function llmsTxtDaLoja(loja: LojaPublica, carros: CarroPublico[]): string {
  const linhas: string[] = [`# ${loja.nome}`, ""];
  linhas.push(`> ${loja.sobre?.replace(/\s+/g, " ").trim().slice(0, 300) || `Revenda de veículos seminovos e usados. Estoque atualizado, financiamento e avaliação do seu carro na troca.`}`, "");
  const dados = [
    loja.endereco && `- Endereço: ${loja.endereco}`,
    loja.whatsapp && `- WhatsApp: +${loja.whatsapp}`,
    loja.horario.length > 0 && `- Horário: ${loja.horario.join("; ")}`,
    `- Site: ${linkDaLoja(loja.slug, loja.dominio)}`,
    loja.instagram && `- Instagram: ${loja.instagram}`,
  ].filter(Boolean) as string[];
  linhas.push("## Contato", ...dados, "");
  linhas.push("## Páginas", ...enderecoDasPaginas(loja).filter((p) => p.nome !== "Política de privacidade").map((p) => `- [${p.nome}](${p.url})`), "");
  linhas.push(`## Estoque (${carros.length} veículos)`);
  for (const c of carros.slice(0, 300)) {
    const detalhe = [brl(c.precoCents), c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : null, c.cambio, c.combustivel, c.cor, c.status === "RESERVADO" ? "reservado" : null].filter(Boolean).join(", ");
    linhas.push(`- [${nomeDoVeiculo(c)}](${linkDoCarro(loja.slug, c.id, loja.dominio)}): ${detalhe}`);
  }
  return `${linhas.join("\n")}\n`;
}

/** Trilha de navegação (Início > Marca > Carro): o Google mostra no resultado e as IAs entendem a estrutura. */
export function breadcrumbJsonLd(loja: LojaPublica, c: CarroPublico, urlDoCarro: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: loja.nome, item: linkDaLoja(loja.slug, loja.dominio) },
      { "@type": "ListItem", position: 2, name: nomeDoVeiculo(c), item: urlDoCarro },
    ],
  };
}
