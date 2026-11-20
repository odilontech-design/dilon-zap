/** Pedaços puros da busca do Inbox (sem banco), separados pra poder testar. */
/**
 * Palavras da busca. A pontuação some e as iniciais soltas ("T." em "Marcelo T.
 * Affonso") não contam: quem digita o nome completo acha o contato salvo só
 * com o primeiro e o último nome. No máximo 6 palavras, para a consulta não
 * crescer sem limite.
 */
export function termosDaBusca(busca: string | undefined): string[] {
  if (!busca) return [];
  const palavras = busca
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length > 1 || /\d/.test(w));
  const unicas = [...new Set(palavras)].slice(0, 6);
  return unicas.length ? unicas : [busca.trim()];
}

import { normalizarParaBusca } from "./busca";

const VARIANTES: Record<string, string> = {
  a: "aáàâãäå",
  e: "eéèêë",
  i: "iíìîï",
  o: "oóòôõö",
  u: "uúùûü",
  c: "cç",
  n: "nñ",
  y: "yýÿ",
};

/**
 * Expressão regular (Postgres) que casa o termo com qualquer acento e qualquer
 * caixa: cada vogal vira uma classe ("rua" → r[uúùûüUÚÙÛÜ]a). Dobrar a coluna
 * inteira com translate() deixava a busca 10x mais lenta (2,5 s contra 0,15 s
 * em 190 mil mensagens, medido na produção), e a lista é consultada em laço —
 * por isso o acento é resolvido no padrão, não no texto guardado.
 */
export function padraoSemAcento(termo: string): string {
  let saida = "";
  for (const c of normalizarParaBusca(termo)) {
    const v = VARIANTES[c];
    if (v) saida += `[${v}${v.toUpperCase()}]`;
    else if (/[\\.^$|?*+()[\]{}]/.test(c)) saida += `\\${c}`;
    else saida += c;
  }
  return saida;
}

// Início de palavra: "ibe" não casa com "recebe", mas "flor" casa com "flores".
export const INICIO_DE_PALAVRA = "(^|[^[:alnum:]])";
