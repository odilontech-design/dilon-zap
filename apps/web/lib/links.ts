/**
 * Acha os endereços de site dentro do texto de uma mensagem, para a tela
 * desenhá-los como link clicável.
 *
 * Puro e com teste porque a fronteira do link é onde isso costuma errar: o
 * ponto final da frase não faz parte do endereço, o ")" que fecha um
 * parêntese também não, mas o ")" de dentro de um endereço da Wikipédia faz.
 *
 * Reconhece três formas, como o WhatsApp:
 *  - com protocolo: https://exemplo.com/pagina
 *  - com www: www.exemplo.com.br
 *  - só o domínio, quando termina num sufixo conhecido: dilontech.com.br/questionario
 *    (foi o caso que motivou isto: a equipe cola o endereço sem o https://).
 *
 * Só http e https saem daqui. "javascript:" e afins nunca viram link, e e-mail
 * (nome@dominio.com) não é tratado como endereço de site.
 */

export type Trecho = { tipo: "texto"; texto: string } | { tipo: "link"; texto: string; href: string };

/** Sufixos aceitos para o domínio sem protocolo. Os mais longos primeiro. */
const SUFIXOS = [
  "com\\.br", "gov\\.br", "edu\\.br", "org\\.br", "net\\.br",
  "com", "net", "org", "io", "app", "dev", "co", "me", "ai", "br", "info", "biz",
  "site", "online", "shop", "store", "tech", "xyz", "link", "ly", "tv", "us", "pt", "ar", "cl", "mx",
].join("|");

const PADRAO = new RegExp(
  // 1) com protocolo ou www
  "((?:https?:\\/\\/|www\\.)[^\\s<>]+)" +
    "|" +
    // 2) só o domínio (o que vem colado antes é conferido em comecoValido: não pega e-mail nem pedaço de caminho)
    "((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:" +
    SUFIXOS +
    ")(?![\\p{L}\\p{N}@-])(?::\\d{2,5})?(?:\\/[^\\s<>]*)?)",
  "giu"
);

const NAO_PODE_ANTES = /[\p{L}\p{N}@./-]/u;
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

/**
 * O que está colado ANTES do domínio sem protocolo. Conferido aqui, e não com
 * lookbehind no regex, porque o Safari só aceita lookbehind a partir da versão
 * 16.4 e um regex que ele não entende derruba o carregamento da tela inteira.
 *
 * Não pode vir letra, número, @, ponto, barra ou hífen (e-mail, pedaço de
 * caminho, "meu_site.com"). O "_" só vale se for de itálico (começo de palavra).
 */
function comecoValido(texto: string, inicio: number): boolean {
  if (inicio === 0) return true;
  const anterior = texto[inicio - 1];
  if (anterior === "_") return !(inicio >= 2 && LETRA_OU_NUMERO.test(texto[inicio - 2]));
  return !NAO_PODE_ANTES.test(anterior);
}

/** Pontuação que costuma vir colada no fim do endereço sem fazer parte dele. */
const PONTUACAO_FINAL = ".,;:!?*_~'\"»”’";

function conta(texto: string, c: string) {
  return texto.split(c).length - 1;
}

/** Separa o endereço do que sobrou colado no fim (ponto da frase, ")" que fecha parêntese, marca de negrito). */
function aparar(candidato: string): { link: string; sobra: string } {
  let fim = candidato.length;
  while (fim > 0) {
    const c = candidato[fim - 1];
    if (PONTUACAO_FINAL.includes(c)) {
      fim--;
      continue;
    }
    // Fecha-parêntese só sai se não houver o que ele fechar dentro do endereço.
    if (c === ")" && conta(candidato.slice(0, fim), ")") > conta(candidato.slice(0, fim), "(")) {
      fim--;
      continue;
    }
    if (c === "]" && conta(candidato.slice(0, fim), "]") > conta(candidato.slice(0, fim), "[")) {
      fim--;
      continue;
    }
    break;
  }
  return { link: candidato.slice(0, fim), sobra: candidato.slice(fim) };
}

/** O endereço completo para o href, ou null se não for um site http(s) com domínio de verdade. */
function hrefDe(texto: string): string | null {
  const href = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // "http://x" ou "www.x" sem ponto no domínio não é um site que a pessoa vai querer abrir.
    if (!u.hostname.includes(".")) return null;
    return href;
  } catch {
    return null;
  }
}

/** Quebra o texto em pedaços de texto comum e links. Juntar todos os pedaços devolve o texto original. */
export function partirEmLinks(texto: string): Trecho[] {
  const saida: Trecho[] = [];
  let cursor = 0;
  const empurrarTexto = (t: string) => {
    if (!t) return;
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.tipo === "texto") ultimo.texto += t;
    else saida.push({ tipo: "texto", texto: t });
  };

  for (const m of texto.matchAll(PADRAO)) {
    const inicio = m.index ?? 0;
    // m[2] é o domínio sem protocolo: só vale se o que vem antes permitir.
    if (m[2] !== undefined && !comecoValido(texto, inicio)) continue;
    const { link } = aparar(m[0]);
    const href = link ? hrefDe(link) : null;
    if (!href) continue; // fica como texto: entra no próximo empurrarTexto, pelo cursor
    empurrarTexto(texto.slice(cursor, inicio));
    saida.push({ tipo: "link", texto: link, href });
    // O que sobrou colado no fim (ponto, parêntese) não entra no cursor: volta a ser texto.
    cursor = inicio + link.length;
  }
  empurrarTexto(texto.slice(cursor));
  return saida;
}

/** Só os endereços, para conferir em teste e para quem precisar da lista. */
export function linksDoTexto(texto: string): string[] {
  return partirEmLinks(texto).flatMap((t) => (t.tipo === "link" ? [t.href] : []));
}
