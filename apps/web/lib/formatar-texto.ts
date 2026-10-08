/**
 * Formatação de texto pro WhatsApp: o que a atendente cola e o que ela marca.
 *
 * Puro e com teste porque mexe no que vai pro cliente: uma regra que come um
 * asterisco a mais ou junta duas linhas que deveriam ficar separadas muda a
 * mensagem sem ninguém ver, e o texto já saiu quando alguém percebe.
 *
 * Sintaxe do WhatsApp: *negrito*, _itálico_, ~tachado~, ```código```.
 * Um asterisco, não dois — o `**negrito**` do Markdown aparece com os
 * asteriscos sobrando na tela do cliente.
 */

export type Marca = "*" | "_" | "~" | "```";

export type Edicao = { texto: string; inicio: number; fim: number };

/**
 * Envolve a seleção com a marca, ou tira a marca se ela já está lá.
 *
 * Sem seleção, coloca o par vazio e deixa o cursor no meio — é o que a pessoa
 * espera ao apertar "negrito" e começar a digitar.
 *
 * O espaço na ponta da seleção fica de FORA da marca. O WhatsApp só reconhece
 * `*texto*` quando o asterisco encosta na palavra: `* texto *` aparece com os
 * asteriscos soltos, e selecionar uma palavra com o duplo clique costuma levar
 * o espaço junto.
 */
export function aplicarMarca(texto: string, inicio: number, fim: number, marca: Marca): Edicao {
  const a = Math.min(inicio, fim);
  const b = Math.max(inicio, fim);
  const tam = marca.length;

  if (a === b) {
    return {
      texto: texto.slice(0, a) + marca + marca + texto.slice(a),
      inicio: a + tam,
      fim: a + tam,
    };
  }

  // Encolhe a seleção pra dentro dos espaços das pontas.
  let ini = a;
  let f = b;
  while (ini < f && /\s/.test(texto[ini])) ini++;
  while (f > ini && /\s/.test(texto[f - 1])) f--;
  if (ini === f) return { texto, inicio: a, fim: b };

  // Já marcada, com a marca dentro da seleção: tira.
  const dentro = texto.slice(ini, f);
  if (dentro.length >= tam * 2 && dentro.startsWith(marca) && dentro.endsWith(marca)) {
    const limpo = dentro.slice(tam, dentro.length - tam);
    return {
      texto: texto.slice(0, ini) + limpo + texto.slice(f),
      inicio: ini,
      fim: ini + limpo.length,
    };
  }

  // Já marcada, com a marca logo fora da seleção: também tira.
  if (texto.slice(ini - tam, ini) === marca && texto.slice(f, f + tam) === marca) {
    return {
      texto: texto.slice(0, ini - tam) + dentro + texto.slice(f + tam),
      inicio: ini - tam,
      fim: ini - tam + dentro.length,
    };
  }

  return {
    texto: texto.slice(0, ini) + marca + dentro + marca + texto.slice(f),
    inicio: ini + tam,
    fim: f + tam,
  };
}

export type TipoDeLinha = "numerada" | "marcadores" | "citacao";

/**
 * Qualquer prefixo de lista ou citação que já esteja na linha. O espaço depois
 * é obrigatório: `*texto*` (negrito) começa com asterisco e NÃO é marcador, e
 * sem exigir o espaço a conversão comeria o negrito da primeira palavra.
 */
const PREFIXO_QUALQUER = /^([ \t]*)(?:\d+\.|[-•*]|>)[ \t]+/;

const PREFIXO_DO_TIPO: Record<TipoDeLinha, RegExp> = {
  numerada: /^[ \t]*\d+\.[ \t]+/,
  marcadores: /^[ \t]*[-•*][ \t]+/,
  citacao: /^[ \t]*>[ \t]+/,
};

/**
 * Lista numerada, lista com marcadores ou citação.
 *
 * Diferente de negrito e itálico, essas três valem POR LINHA: o WhatsApp só as
 * reconhece no começo da linha (`1. `, `- `, `> `). Por isso a seleção cresce
 * até as linhas inteiras que ela toca; sem seleção, vale a linha do cursor.
 *
 * Apertar de novo desfaz — mas só se TODAS as linhas já forem daquele tipo.
 * Numa seleção mista (duas linhas numeradas e uma solta), o clique completa a
 * lista em vez de apagar o que a pessoa já tinha feito.
 *
 * Linha em branco fica de fora e não gasta número: a lista numerada continua
 * 1, 2, 3 mesmo com um parágrafo vazio no meio da seleção.
 *
 * Trocar de tipo (de marcadores pra numerada) tira o prefixo antigo antes de
 * pôr o novo, senão sairia "1. - item".
 */
export function aplicarLinhas(texto: string, inicio: number, fim: number, tipo: TipoDeLinha): Edicao {
  const a = Math.min(inicio, fim);
  const b = Math.max(inicio, fim);

  // Cresce até o começo da primeira linha e o fim da última. Se a seleção
  // termina exatamente no começo de uma linha (arrastou até o início da
  // próxima), essa próxima linha não entra — a pessoa não selecionou nada nela.
  const comeco = texto.lastIndexOf("\n", a - 1) + 1;
  const fimDaSelecao = b > a && texto[b - 1] === "\n" ? b - 1 : b;
  const proximaQuebra = texto.indexOf("\n", fimDaSelecao);
  const termino = proximaQuebra === -1 ? texto.length : proximaQuebra;

  const linhas = texto.slice(comeco, termino).split("\n");
  const comConteudo = linhas.filter((l) => l.trim() !== "");
  if (comConteudo.length === 0) return { texto, inicio: a, fim: b };

  const jaTodas = comConteudo.every((l) => PREFIXO_DO_TIPO[tipo].test(l));

  let n = 0;
  const novas = linhas.map((linha) => {
    if (linha.trim() === "") return linha;
    const limpa = linha.replace(PREFIXO_QUALQUER, "$1");
    if (jaTodas) return limpa.replace(/^[ \t]+/, "");

    n++;
    const recuo = limpa.match(/^[ \t]*/)?.[0] ?? "";
    const corpo = limpa.slice(recuo.length);
    const prefixo = tipo === "numerada" ? `${n}. ` : tipo === "marcadores" ? "- " : "> ";
    return recuo + prefixo + corpo;
  });

  const bloco = novas.join("\n");
  return {
    texto: texto.slice(0, comeco) + bloco + texto.slice(termino),
    inicio: comeco,
    fim: comeco + bloco.length,
  };
}

/**
 * Arruma o texto colado de outro lugar — ferramenta de IA, e-mail, planilha.
 *
 * Só roda quando a pessoa pede, nunca sozinho. Algumas dessas trocas seriam
 * erradas num texto que a pessoa escreveu de propósito (quem explica algo
 * sobre programação pode querer o `\n` literal), então a decisão é dela.
 *
 * O que faz, em ordem:
 *  1. Quebras de linha do Windows viram quebras simples.
 *  2. Um `\n` ESCRITO (barra e letra n) vira quebra de verdade. É o que sobra
 *     quando a IA entrega o texto "escapado" — foi o caso que motivou isto.
 *  3. Markdown vira WhatsApp: `**negrito**` → `*negrito*`, `# Título` →
 *     `*Título*`.
 *  4. Marcadores de lista de outras origens (○ ● ▪) viram `•`.
 *  5. Espaço no fim de linha sai, e mais de uma linha em branco seguida vira
 *     uma só.
 */
export function organizarTexto(entrada: string): string {
  let t = entrada.replace(/\r\n?/g, "\n");

  // Só a sequência barra+n. Barra+n+letra continuaria sendo "\n" seguido de
  // texto, que é exatamente o caso do menu ("\n1 - Quero...").
  t = t.replace(/\\n/g, "\n");

  // Título em Markdown: a linha inteira vira negrito. Tira os ** de dentro pra
  // não ficar `***Título***`.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, titulo: string) => {
    return `*${titulo.replace(/\*\*/g, "").replace(/\*/g, "")}*`;
  });

  // **negrito** → *negrito*. Só o par fechado na mesma linha: um `**` solto
  // (multiplicação, nota de rodapé) fica como está.
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");

  t = t.replace(/^([ \t]*)[○●◦▪■·][ \t]+/gm, "$1• ");

  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

/** Há o que arrumar? Serve pra só oferecer o botão quando faz diferença. */
export function precisaOrganizar(texto: string): boolean {
  return texto.length > 0 && organizarTexto(texto) !== texto.trim();
}
