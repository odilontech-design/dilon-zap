import { NextResponse, type NextRequest } from "next/server";

/**
 * Domínio próprio da loja (www.salesautomoveis.com.br) apontado para o Zap.
 *
 * O Zap responde em zap.dilontech.com.br; qualquer outro host que chega aqui
 * é o domínio de alguma vitrine (o Caddy só emite certificado para domínio
 * cadastrado, ver /api/loja/dominio/permitido). Nesse domínio:
 *
 *   /             → a vitrine da loja (/loja/[slug])
 *   /financiamento, /venda-seu-carro, /localizacao, /privacidade → as páginas dela
 *   /sitemap.xml  → o sitemap dela
 *   /robots.txt   → o robots dela
 *   /loja/[slug]/… e /api/loja/[slug]/… seguem normais (fotos, formulário, feeds)
 *   o resto (login, painel, outras lojas) volta para a raiz: o domínio da loja
 *   não abre o sistema.
 *
 * Quem é dono do domínio vem de /api/loja/dominio, com cache de 1 minuto em
 * memória: a pergunta é ao banco, e uma vitrine recebe muitas visitas.
 */

/** As páginas internas da vitrine (a mesma lista de PAGINAS em lib/vitrine-aparencia.ts; o middleware não importa o módulo, para ficar leve). */
const PAGINAS_DA_LOJA = new Set(["venda-seu-carro", "financiamento", "localizacao", "privacidade"]);

const cache = new Map<string, { slug: string | null; ate: number }>();
const TTL_MS = 60_000;

function hostsDoSistema(): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "web"]);
  try {
    if (process.env.NEXTAUTH_URL) hosts.add(new URL(process.env.NEXTAUTH_URL).hostname.toLowerCase());
  } catch {
    // NEXTAUTH_URL inválida: segue só com os locais.
  }
  return hosts;
}

async function slugDoDominio(host: string): Promise<string | null> {
  const guardado = cache.get(host);
  if (guardado && guardado.ate > Date.now()) return guardado.slug;
  let slug: string | null = null;
  try {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT ?? "3000"}/api/loja/dominio?host=${encodeURIComponent(host)}`, { cache: "no-store" });
    if (r.ok) slug = ((await r.json()) as { slug?: string }).slug ?? null;
  } catch {
    // Falha na consulta: não guarda, tenta de novo na próxima visita.
    return null;
  }
  cache.set(host, { slug, ate: Date.now() + TTL_MS });
  return slug;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host || hostsDoSistema().has(host) || /^[\d.]+$/.test(host)) return NextResponse.next();

  const slug = await slugDoDominio(host);
  if (!slug) return new NextResponse("Loja não encontrada", { status: 404 });

  const p = req.nextUrl.pathname;
  const reescrever = (destino: string) => {
    const url = req.nextUrl.clone();
    url.pathname = destino;
    return NextResponse.rewrite(url);
  };
  if (p === "/") return reescrever(`/loja/${slug}`);
  // Páginas da loja no domínio próprio: /financiamento, /localizacao… (com ou sem barra no fim).
  const pagina = p.replace(/\/+$/, "").slice(1);
  if (PAGINAS_DA_LOJA.has(pagina)) return reescrever(`/loja/${slug}/${pagina}`);
  if (p === "/sitemap.xml") return reescrever(`/api/loja/${slug}/sitemap`);
  if (p === "/robots.txt") return reescrever(`/api/loja/${slug}/robots`);
  if (p === `/loja/${slug}` || p.startsWith(`/loja/${slug}/`) || p.startsWith(`/api/loja/${slug}/`) || p.startsWith("/_next/") || /\.(png|ico|svg|jpg|webmanifest)$/.test(p)) {
    return NextResponse.next();
  }
  // Monta com o domínio do visitante: req.nextUrl traz o host interno do
  // servidor (web:3000), e redirecionar para ele mandaria o cliente para fora.
  const protocolo = req.headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  return NextResponse.redirect(`${protocolo}://${host}/`);
}

export const config = {
  // Imagens e arquivos estáticos do Next não passam por aqui.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
