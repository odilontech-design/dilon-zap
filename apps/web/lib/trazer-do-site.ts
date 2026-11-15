import { prisma } from "@dilon-zap/db";
import { uploadMedia } from "@dilon-zap/storage";
import { baixarImagem } from "@/lib/baixar-imagem";
import { buscarPagina } from "@/lib/buscar-pagina";
import { decodificar, enderecoDoSite } from "@/lib/importar-site";
import { MAX_BANNERS, MAX_DESTAQUES, criarBanner, salvarDestaques, salvarPaginas } from "@/lib/meu-site";

/**
 * "Trazer do site atual": copia do site que a loja já tem (o do AutoCerto) os banners do topo,
 * os carros de "Últimas ofertas" e o texto do "Quem somos", para o site novo nascer igual ao
 * antigo. Os carros em si vêm pela importação do estoque (que guarda o id do carro no site
 * antigo em Veiculo.siteOrigemId); aqui só se casa a lista de ofertas com eles.
 *
 * Não apaga nada: banner que já foi trazido não vem de novo, e destaques e Quem somos só são
 * preenchidos se estiverem vazios (ou se a pessoa pedir para substituir).
 */

const texto = (html: string) => decodificar(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").trim();

/** Prefixo do título dos banners trazidos: é por ele que um banner não é trazido duas vezes. */
export const PREFIXO_BANNER = "Do site atual: ";

/** As imagens dos banners do topo: os fundos (background url) dos blocos com classe "banner", sem repetir. */
export function bannersDaPagina(html: string, base: string): string[] {
  const achados: string[] = [];
  for (const m of html.matchAll(/<[a-z]+[^>]*class="[^"]*\bbanner\b[^"]*"[^>]*>/gi)) {
    const url = m[0].match(/background(?:-image)?\s*:[^;"]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
    if (!url) continue;
    try {
      const u = new URL(decodificar(url.trim()), base);
      if (/\.(jpe?g|png|webp)$/i.test(u.pathname)) achados.push(u.toString());
    } catch {
      /* endereço quebrado: ignora */
    }
  }
  return [...new Set(achados)].slice(0, MAX_BANNERS);
}

/** Os ids (do site antigo) dos carros do bloco "Últimas ofertas" da página inicial, na ordem. */
export function ofertasDaPagina(html: string): string[] {
  const inicio = html.search(/<h[1-6][^>]*>\s*(?:Últimas|&#218;ltimas|ULTIMAS|ÚLTIMAS|&Uacute;LTIMAS)\s+ofertas\s*<\/h[1-6]>/i);
  if (inicio < 0) return [];
  const resto = html.slice(inicio);
  const fim = resto.slice(10).search(/<div class="section-header|<footer/i);
  const bloco = fim < 0 ? resto : resto.slice(0, fim + 10);
  const ids = [...bloco.matchAll(/href="[^"]*\/Veiculo\/[^/"]+\/(\d+)\/detalhes"/gi)].map((m) => `autocerto:${m[1]}`);
  return [...new Set(ids)].slice(0, MAX_DESTAQUES);
}

/** O "Quem somos" da página da empresa: o título (frase em destaque) e os parágrafos do corpo — nunca o resumo cortado do rodapé. */
export function quemSomosDaPagina(html: string): { titulo: string | null; texto: string | null } {
  const ini = html.search(/role="main"|<main[\s>]/i);
  const corpo = html.slice(ini < 0 ? 0 : ini);
  const fim = corpo.search(/<footer/i);
  const miolo = fim < 0 ? corpo : corpo.slice(0, fim);
  const lead = miolo.match(/<p[^>]*class="[^"]*\blead\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const titulo = lead ? texto(lead[1]) : null;
  const paragrafos = [...miolo.matchAll(/<p(?![^>]*\blead\b)[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => texto(m[1])).filter((p) => p.length > 20 && !p.includes("[...]"));
  return { titulo: titulo?.slice(0, 200) || null, texto: paragrafos.join("\n\n").slice(0, 6000) || null };
}

/** O endereço da página "Quem somos/Empresa" a partir dos links da página inicial. */
export function enderecoDaEmpresa(html: string, base: string): string {
  const link = html.match(/href="([^"]*\/(?:empresa|quem-?somos|sobre)[^"]*)"/i)?.[1];
  return new URL(link ? decodificar(link) : "/Empresa", base).toString();
}

export type ResultadoTrazer = {
  endereco: string;
  banners: { achados: number; trazidos: number; jaTinha: number; falhas: string[] };
  ofertas: { achadas: number; noZap: number; aplicadas: boolean; motivo?: string };
  quemSomos: { achado: boolean; aplicado: boolean; motivo?: string };
};

type Dependencias = {
  buscar: (url: string) => Promise<{ html: string; urlFinal: string }>;
  baixar: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
  subir: typeof uploadMedia;
};

const padrao: Dependencias = { buscar: (u) => buscarPagina(u), baixar: (u) => baixarImagem(u), subir: uploadMedia };

export async function trazerDoSite(
  tenantId: string,
  opcoes: { endereco?: string | null; substituir?: boolean } = {},
  dep: Dependencias = padrao
): Promise<{ ok: true; resultado: ResultadoTrazer } | { ok: false; erro: string }> {
  const cfg = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { siteOrigemUrl: true, destaques: true, quemSomosTitulo: true, quemSomosTexto: true } });
  const url = enderecoDoSite(opcoes.endereco || cfg?.siteOrigemUrl || "");
  if (!url) return { ok: false, erro: "informe o endereço do site atual da loja" };
  url.pathname = "/";
  url.search = "";

  let home: { html: string; urlFinal: string };
  try {
    home = await dep.buscar(url.toString());
  } catch (e) {
    return { ok: false, erro: `não consegui abrir o site: ${e instanceof Error ? e.message : "erro"}` };
  }
  const r: ResultadoTrazer = { endereco: home.urlFinal, banners: { achados: 0, trazidos: 0, jaTinha: 0, falhas: [] }, ofertas: { achadas: 0, noZap: 0, aplicadas: false }, quemSomos: { achado: false, aplicado: false } };

  // Banners: na ordem do site antigo, sem trazer de novo os que já vieram.
  const imagens = bannersDaPagina(home.html, home.urlFinal);
  r.banners.achados = imagens.length;
  const existentes = new Set((await prisma.bannerVitrine.findMany({ where: { tenantId, titulo: { startsWith: PREFIXO_BANNER } }, select: { titulo: true } })).map((b) => b.titulo));
  for (const imagem of imagens) {
    const nome = decodeURIComponent(new URL(imagem).pathname.split("/").pop() ?? "banner").replace(/\.[a-z]+$/i, "");
    const titulo = `${PREFIXO_BANNER}${nome}`.slice(0, 120);
    if (existentes.has(titulo)) {
      r.banners.jaTinha++;
      continue;
    }
    try {
      const img = await dep.baixar(imagem);
      const criado = await criarBanner(tenantId, { desktop: { tipo: img.contentType, tamanho: img.bytes.length, bytes: async () => img.bytes }, titulo }, dep.subir);
      if (!criado.ok) {
        r.banners.falhas.push(`${nome}: ${criado.erro}`);
        if (criado.erro.startsWith("no máximo")) break;
        continue;
      }
      existentes.add(titulo);
      r.banners.trazidos++;
    } catch (e) {
      r.banners.falhas.push(`${nome}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  // Últimas ofertas: casa os ids do site antigo com os carros já importados e à venda.
  const ofertas = ofertasDaPagina(home.html);
  r.ofertas.achadas = ofertas.length;
  if (ofertas.length) {
    const carros = await prisma.veiculo.findMany({ where: { tenantId, siteOrigemId: { in: ofertas }, status: "DISPONIVEL" }, select: { id: true, siteOrigemId: true } });
    const porOrigem = new Map(carros.map((c) => [c.siteOrigemId, c.id]));
    const ids = ofertas.map((o) => porOrigem.get(o)).filter((id): id is string => !!id);
    r.ofertas.noZap = ids.length;
    if (!ids.length) r.ofertas.motivo = "nenhum desses carros está no Zap à venda (importe o estoque do site primeiro)";
    else if (cfg?.destaques.length && !opcoes.substituir) r.ofertas.motivo = "você já escolheu destaques; marque “substituir” para trocar";
    else {
      await salvarDestaques(tenantId, ids, undefined);
      r.ofertas.aplicadas = true;
    }
  }

  // Quem somos: da página da empresa.
  try {
    const empresa = await dep.buscar(enderecoDaEmpresa(home.html, home.urlFinal));
    const qs = quemSomosDaPagina(empresa.html);
    r.quemSomos.achado = !!(qs.titulo || qs.texto);
    if (r.quemSomos.achado) {
      if ((cfg?.quemSomosTitulo || cfg?.quemSomosTexto) && !opcoes.substituir) r.quemSomos.motivo = "o Quem somos já está preenchido; marque “substituir” para trocar";
      else {
        await salvarPaginas(tenantId, { quemSomosTitulo: qs.titulo, quemSomosTexto: qs.texto });
        r.quemSomos.aplicado = true;
      }
    }
  } catch (e) {
    r.quemSomos.motivo = `não consegui abrir a página da empresa: ${e instanceof Error ? e.message : "erro"}`;
  }

  // O endereço não é guardado aqui de propósito: siteOrigemUrl liga o espelho do estoque (lib/espelho-do-site.ts).
  return { ok: true, resultado: r };
}
