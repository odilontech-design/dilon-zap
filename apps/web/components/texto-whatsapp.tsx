import { Fragment, type ReactNode } from "react";

/**
 * Desenha a formatação do WhatsApp no texto da mensagem: *negrito*,
 * _itálico_, ~tachado~, `código` e ```bloco```. Antes o Dilon Zap mostrava os
 * asteriscos crus — o cliente via negrito no celular e a equipe via "*Se*"
 * na tela, e achava que não tinha funcionado (Hemoderi, 15/10).
 *
 * Mesma regra do WhatsApp: a marca precisa encostar no texto (sem espaço logo
 * depois de abrir nem logo antes de fechar) e não pode estar grudada numa
 * letra por fora — "2*3*4" continua conta, "nome_do_arquivo" continua nome.
 * Endereço de site passa intacto. Gera elementos React, nunca HTML cru.
 */
export function TextoWhatsApp({ texto }: { texto: string }) {
  return <>{formatar(texto)}</>;
}

/** O texto sem as marcas, para a prévia da lista de conversas. */
export function semMarcacao(texto: string): string {
  return texto
    .replace(/```([\s\S]+?)```/g, "$1")
    .replace(/(^|[^\p{L}\p{N}])([*_~`])(?!\s)([^\n]*?[^\s])\2(?![\p{L}\p{N}])/gu, "$1$3");
}

const URL = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

function formatar(texto: string): ReactNode[] {
  // Bloco ``` primeiro (pode ter várias linhas e não é formatado por dentro).
  const partes: ReactNode[] = [];
  const blocos = texto.split(/(```[\s\S]+?```)/g);
  blocos.forEach((bloco, i) => {
    if (bloco.startsWith("```") && bloco.endsWith("```") && bloco.length > 6) {
      partes.push(
        <code key={`b${i}`} className="font-mono text-[0.92em] bg-black/5 rounded px-1">
          {bloco.slice(3, -3)}
        </code>
      );
    } else {
      // Endereços de site ficam de fora da formatação (o "_" de um link não é itálico).
      bloco.split(URL).forEach((trecho, j) => {
        if (URL.test(trecho)) {
          URL.lastIndex = 0;
          partes.push(<Fragment key={`u${i}-${j}`}>{trecho}</Fragment>);
        } else {
          URL.lastIndex = 0;
          partes.push(<Fragment key={`t${i}-${j}`}>{emLinha(trecho)}</Fragment>);
        }
      });
    }
  });
  return partes;
}

const MARCAS: Record<string, (filhos: ReactNode, k: string) => ReactNode> = {
  "*": (f, k) => <strong key={k}>{f}</strong>,
  _: (f, k) => <em key={k}>{f}</em>,
  "~": (f, k) => <s key={k}>{f}</s>,
  "`": (f, k) => (
    <code key={k} className="font-mono text-[0.92em] bg-black/5 rounded px-1">
      {f}
    </code>
  ),
};

// Marca que abre e fecha na mesma linha, encostada no texto, sem letra grudada por fora.
const EM_LINHA = /(^|[^\p{L}\p{N}])([*_~`])(?!\s)([^\n]*?[^\s])\2(?![\p{L}\p{N}])/u;

function emLinha(texto: string, chave = "f"): ReactNode[] {
  const saida: ReactNode[] = [];
  let resto = texto;
  let n = 0;
  while (resto) {
    const m = EM_LINHA.exec(resto);
    if (!m) {
      saida.push(resto);
      break;
    }
    const inicio = m.index + m[1].length;
    if (inicio > 0) saida.push(resto.slice(0, inicio));
    const marca = m[2];
    const dentro = m[3];
    const k = `${chave}-${n++}`;
    // Código não formata por dentro; as outras marcas podem se combinar (*_negrito itálico_*).
    saida.push(MARCAS[marca](marca === "`" ? dentro : emLinha(dentro, k), k));
    resto = resto.slice(inicio + marca.length + dentro.length + marca.length);
  }
  return saida;
}
