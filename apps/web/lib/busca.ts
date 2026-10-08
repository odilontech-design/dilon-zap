/**
 * Busca de texto numa lista já carregada na tela.
 *
 * Ignora acento e maiúscula: quem digita "relatorios" espera achar
 * "Relatórios", e quem digita "SAO PAULO" espera achar "São Paulo". Sem isso a
 * busca parece quebrada justamente nas palavras mais comuns do português.
 */

export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * O texto contém a busca? Todas as palavras digitadas precisam aparecer, em
 * qualquer ordem — "joao silva" acha "Silva, João". Busca vazia casa tudo.
 */
export function casaComBusca(texto: string, busca: string): boolean {
  const termos = normalizarParaBusca(busca).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;

  const alvo = normalizarParaBusca(texto);
  return termos.every((t) => alvo.includes(t));
}
