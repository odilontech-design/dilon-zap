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
    ...gruposDoEstoque(carros).flatMap((g) => [
      item(linkDaMarca(loja, g.marcaSlug), "<changefreq>daily</changefreq><priority>0.7</priority>"),
      ...g.modelos.map((m) => item(linkDoModelo(loja, g.marcaSlug, m.modeloSlug), "<changefreq>daily</changefreq><priority>0.7</priority>")),
    ]),
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
  const grupos = gruposDoEstoque(carros);
  if (grupos.length) linhas.push("## Por marca", ...grupos.map((g) => `- [${g.marca} (${g.n})](${linkDaMarca(loja, g.marcaSlug)})`), "");
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

// ---------------------------------------------------------------------------
// Páginas por marca e por modelo ("Honda Civic usado em Duque de Caxias"):
// é onde a busca local acontece. Só existem para o que há em estoque agora,
// para não publicar página vazia.
// ---------------------------------------------------------------------------

/** "Citroën C3" → "citroen-c3": sem acento, minúsculo, hifens. */
export function slugDe(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A cidade, tirada do fim do endereço ("Rua A, 10 - Centro, Duque de Caxias - RJ" → "Duque de Caxias"). Nulo se não der para ter certeza. */
export function cidadeDaLoja(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  const m = endereco.trim().match(/([A-Za-zÀ-ú' ]{3,40}?)\s*[-–/,]\s*([A-Z]{2})\s*\.?$/);
  if (!m) return null;
  const cidade = m[1].trim().split(/\s*[,-]\s*/).pop()?.trim() ?? "";
  return cidade.length >= 3 && !/\d/.test(cidade) ? cidade : null;
}

export type GrupoDeCarros = { marca: string; marcaSlug: string; modelos: { modelo: string; modeloSlug: string; n: number }[]; n: number };

/** Marcas e modelos do estoque, com a contagem, na ordem de quem tem mais carros. */
export function gruposDoEstoque(carros: Pick<CarroPublico, "marca" | "modelo">[]): GrupoDeCarros[] {
  const marcas = new Map<string, GrupoDeCarros>();
  for (const c of carros) {
    const ms = slugDe(c.marca);
    const mo = slugDe(c.modelo);
    if (!ms || !mo) continue;
    const g = marcas.get(ms) ?? { marca: c.marca, marcaSlug: ms, modelos: [], n: 0 };
    g.n++;
    const m = g.modelos.find((x) => x.modeloSlug === mo);
    if (m) m.n++;
    else g.modelos.push({ modelo: c.modelo, modeloSlug: mo, n: 1 });
    marcas.set(ms, g);
  }
  return [...marcas.values()].map((g) => ({ ...g, modelos: g.modelos.sort((a, b) => b.n - a.n || a.modelo.localeCompare(b.modelo, "pt-BR")) })).sort((a, b) => b.n - a.n || a.marca.localeCompare(b.marca, "pt-BR"));
}

export const linkDaMarca = (loja: Pick<LojaPublica, "slug" | "dominio">, marcaSlug: string) => `${baseDaLoja(loja.dominio)}/loja/${loja.slug}/marca/${marcaSlug}`;
export const linkDoModelo = (loja: Pick<LojaPublica, "slug" | "dominio">, marcaSlug: string, modeloSlug: string) => `${linkDaMarca(loja, marcaSlug)}/${modeloSlug}`;

export function carrosDoGrupo<T extends Pick<CarroPublico, "marca" | "modelo">>(carros: T[], marcaSlug: string, modeloSlug?: string): T[] {
  return carros.filter((c) => slugDe(c.marca) === marcaSlug && (!modeloSlug || slugDe(c.modelo) === modeloSlug));
}

/** Título/descrição/abertura da página de uma marca ou modelo. */
export function textosDoGrupo(loja: Pick<LojaPublica, "nome" | "endereco">, nome: string, carros: CarroPublico[]) {
  const cidade = cidadeDaLoja(loja.endereco);
  const menor = Math.min(...carros.map((c) => c.precoCents));
  const anos = carros.map((c) => c.anoModelo);
  const faixaAnos = Math.min(...anos) === Math.max(...anos) ? `${anos[0]}` : `${Math.min(...anos)} a ${Math.max(...anos)}`;
  const qtd = carros.length === 1 ? "1 unidade" : `${carros.length} unidades`;
  return {
    titulo: `${nome} usado${cidade ? ` em ${cidade}` : ""} | ${loja.nome}`.slice(0, 110),
    h1: `${nome} usado${cidade ? ` em ${cidade}` : ""}`,
    descricao: `${nome} usado${cidade ? ` em ${cidade}` : ""}: ${qtd} na ${loja.nome}, anos ${faixaAnos}, a partir de ${brl(menor)}. Veja fotos, ficha completa e simule o financiamento.`.slice(0, 200),
    abertura: `${qtd} de ${nome} à venda${cidade ? ` em ${cidade}` : ""}, a partir de ${brl(menor)}. Todos com fotos e ficha completa; fale com a ${loja.nome} pelo WhatsApp ou simule o financiamento.`,
  };
}

/** Lista de carros da página (ItemList): ajuda o Google e as IAs a entender o que a página reúne. */
export function listaJsonLd(nome: string, carros: CarroPublico[], urlDe: (c: CarroPublico) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: nome,
    numberOfItems: carros.length,
    itemListElement: carros.slice(0, 50).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: urlDe(c), name: nomeDoVeiculo(c) })),
  };
}
