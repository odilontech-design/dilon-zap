/**
 * Leitor do site atual da loja, para trazer o estoque sem digitar carro por
 * carro. Hoje entende o layout do AutoCerto (usado por muitas revendas,
 * inclusive a Sales): uma página de lista com todos os carros e uma página
 * de detalhe por carro, com opcionais e as fotos.
 *
 * Puro: recebe o HTML e devolve dados. Quem busca a página (com a proteção
 * contra endereço interno) e quem grava no banco ficam em outros módulos.
 *
 * O que o site costuma NÃO publicar, e por isso o carro entra "em
 * preparação": preço ("Sob Consulta"), quilometragem ("N/I") e placa.
 */

export type CardDoSite = {
  /** Identificador do carro no site de origem ("autocerto:5769805"): evita importar duas vezes e guia o redirecionamento dos endereços antigos. */
  siteId: string;
  /** Endereço absoluto da página do carro. */
  urlDetalhe: string;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  /** 0 quando o site diz "N/I". */
  km: number;
  kmInformado: boolean;
  /** 0 quando o site diz "Sob Consulta". */
  precoCents: number;
  cor: string | null;
  cambio: string | null;
  combustivel: string | null;
  capa: string | null;
};

export type DetalheDoSite = { opcionais: string[]; fotos: string[] };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

const texto = (html: string) => decodificar(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "N/I", vazio ou lixo viram nulo; "45.300 km" vira 45300. */
export function lerKmDoSite(t: string): number | null {
  const d = t.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
}

/** "R$ 79.999,99" → centavos. "Sob Consulta" → 0. */
export function lerPrecoDoSite(t: string): number {
  const m = t.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!m || /sob consulta/i.test(t)) return 0;
  const reais = Number(m[1].replace(/\./g, ""));
  const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return reais * 100 + cent;
}

/** As marcas que o site lista no filtro: servem para separar "LAND ROVER DEFENDER" em marca e modelo. */
export function marcasDoFiltro(html: string): string[] {
  const achadas = [...html.matchAll(/href="\/?veiculos\?marca=([^"]+)"/gi)].map((m) => decodificar(decodeURIComponent(m[1].replace(/\+/g, " "))).trim());
  return [...new Set(achadas)].sort((a, b) => b.length - a.length);
}

/** Divide "VOLKSWAGEN NIVUS" em marca e modelo, usando as marcas conhecidas (a mais longa primeiro) ou a primeira palavra. */
export function separarMarcaModelo(titulo: string, marcas: string[]): { marca: string; modelo: string } | null {
  const t = titulo.replace(/\s+/g, " ").trim();
  const n = normalizar(t);
  for (const m of marcas) {
    const nm = normalizar(m);
    if (n === nm) return null;
    if (n.startsWith(nm + " ")) return { marca: t.slice(0, m.length).trim(), modelo: t.slice(m.length).trim() };
  }
  const i = t.indexOf(" ");
  return i > 0 ? { marca: t.slice(0, i), modelo: t.slice(i + 1).trim() } : null;
}

/** "CHEVROLET" → "Chevrolet", "ALFA ROMEO" → "Alfa Romeo"; siglas curtas (BMW, BYD) ficam como estão. */
export function nomePropio(s: string): string {
  return s
    .split(" ")
    .map((p) => (p.length <= 3 && /^[A-Z0-9]+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(" ");
}

function anosDoTexto(t: string): [number, number] | null {
  const m = t.match(/(\d{4})\s*\/\s*(\d{4})/) ?? t.match(/\b((?:19|20)\d{2})\b/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const limite = new Date().getFullYear() + 2;
  if (a < 1950 || b < 1950 || a > limite || b > limite) return null;
  return [a, b];
}

/** O valor de "<li><span>Rótulo</span><p>Valor</p></li>" de um bloco. */
function especificacao(bloco: string, rotulo: string): string | null {
  const re = new RegExp(`<span>\\s*${rotulo}\\s*</span>\\s*<p>([\\s\\S]*?)</p>`, "i");
  const m = bloco.match(re);
  return m ? texto(m[1]) || null : null;
}

export function lerListaDoSite(html: string, baseUrl: string): { cards: CardDoSite[]; ignorados: number } {
  const marcas = marcasDoFiltro(html);
  const blocos = html.split(/class="result-item"/).slice(1);
  const cards: CardDoSite[] = [];
  let ignorados = 0;
  const vistos = new Set<string>();
  for (const b of blocos) {
    const link = b.match(/href="([^"]*Veiculo\/[^"]+\/(\d+)\/detalhes)"/i);
    const titulo = b.match(/<h4[^>]*result-item-title[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!link || !titulo) {
      ignorados++;
      continue;
    }
    const siteId = `autocerto:${link[2]}`;
    if (vistos.has(siteId)) continue;
    vistos.add(siteId);

    const versaoMatch = titulo[1].match(/<span[^>]*versaoVeiculo[^>]*>([\s\S]*?)<\/span>/i);
    const versao = versaoMatch ? texto(versaoMatch[1]) || null : null;
    const mm = separarMarcaModelo(texto(titulo[1].replace(/<span[\s\S]*?<\/span>/gi, "")), marcas);
    const anos = anosDoTexto(especificacao(b, "Ano") ?? "");
    if (!mm || !anos) {
      ignorados++;
      continue;
    }
    const km = lerKmDoSite(especificacao(b, "Km") ?? "");
    const preco = b.match(/class="price"[^>]*>([\s\S]*?)<\/div>/i);
    const combustivel = b.match(/vehicle-age[^>]*>([\s\S]*?)<\/span>/i);
    const capa = b.match(/<img[^>]*src="([^"]+)"/i);
    cards.push({
      siteId,
      urlDetalhe: new URL(link[1], baseUrl).toString(),
      marca: nomePropio(mm.marca),
      modelo: mm.modelo,
      versao,
      anoFabricacao: anos[0],
      anoModelo: anos[1],
      km: km ?? 0,
      kmInformado: km !== null,
      precoCents: preco ? lerPrecoDoSite(texto(preco[1])) : 0,
      cor: especificacao(b, "Cor"),
      cambio: especificacao(b, "Câmbio"),
      combustivel: combustivel ? texto(combustivel[1]) || null : null,
      capa: capa ? new URL(capa[1], baseUrl).toString() : null,
    });
  }
  return { cards, ignorados };
}

/** Os itens de uma lista com título ("<strong>Opcionais</strong><ul>…"). */
function itensDaLista(html: string, rotulo: string): string[] {
  const bloco = html.match(new RegExp(`<strong>\\s*${rotulo}\\s*</strong>\\s*<ul[^>]*>([\\s\\S]*?)</ul>`, "i"));
  if (!bloco) return [];
  return [...bloco[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => texto(m[1]).slice(0, 60)).filter(Boolean);
}

/** Opcionais e fotos da página do carro. As fotos vêm na ordem do site (a primeira é a capa), sem repetir. */
export function lerDetalheDoSite(html: string, baseUrl: string): DetalheDoSite {
  // "IPVA Pago", "Chave Reserva" e afins são a situação do carro, não opcional, e o
  // site os repete no fim da lista de opcionais: ficam de fora.
  const caracteristicas = new Set(itensDaLista(html, "Caracter[ií]sticas").map(normalizar));
  const opcionais = [...new Set(itensDaLista(html, "Opcionais"))].filter((o) => !caracteristicas.has(normalizar(o))).slice(0, 60);

  const achadas = [...html.matchAll(/<img[^>]+src="([^"]*\/fotos\/\d+\/\d+\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map((m) => new URL(m[1], baseUrl).toString());
  const numero = (u: string) => Number(u.match(/\/(\d+)_[^/]*$/)?.[1] ?? 9999);
  const fotos = [...new Set(achadas)].sort((a, b) => numero(a) - numero(b)).slice(0, 40);
  return { opcionais, fotos };
}

/** O endereço que o usuário digitou, normalizado: com https. */
export function enderecoDoSite(entrada: string): URL | null {
  const t = entrada.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}
