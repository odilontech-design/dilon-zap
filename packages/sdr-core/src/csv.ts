import { ErroSdrCore } from "./erros";
import { LIMITES } from "./limites";

/**
 * Leitura de CSV sem dependência. Cobre o que o Excel e os sistemas brasileiros
 * costumam exportar: separador vírgula, ponto e vírgula, tab ou barra vertical,
 * aspas com "" escapado, quebra de linha dentro de campo e BOM no começo.
 */

export type CsvLido = {
  delimitador: string;
  cabecalho: string[];
  /** Linhas de dados, sem o cabeçalho e sem linhas totalmente vazias. */
  linhas: { numero: number; celulas: string[] }[];
};

const DELIMITADORES = [";", ",", "\t", "|"];

/** Escolhe o delimitador que mais aparece, fora de aspas, nas primeiras linhas. */
export function detectarDelimitador(texto: string): string {
  const contagem = new Map<string, number>(DELIMITADORES.map((d) => [d, 0]));
  let dentroDeAspas = false;
  let linhas = 0;
  for (let i = 0; i < texto.length && linhas < 5; i++) {
    const c = texto[i];
    if (c === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas) {
      if (c === "\n") linhas++;
      else if (contagem.has(c)) contagem.set(c, contagem.get(c)! + 1);
    }
  }
  let melhor = ",";
  let maior = 0;
  for (const d of DELIMITADORES) {
    if (contagem.get(d)! > maior) {
      maior = contagem.get(d)!;
      melhor = d;
    }
  }
  return melhor;
}

export function lerCsv(conteudo: string): CsvLido {
  if (typeof conteudo !== "string" || conteudo.trim() === "") throw new ErroSdrCore("o arquivo está vazio", 400);
  if (Buffer.byteLength(conteudo, "utf8") > LIMITES.arquivoBytes) {
    throw new ErroSdrCore(`o arquivo passa de ${LIMITES.arquivoBytes / 1024 / 1024} MB`, 413);
  }
  const texto = conteudo.charCodeAt(0) === 0xfeff ? conteudo.slice(1) : conteudo;
  const delimitador = detectarDelimitador(texto);

  const registros: { numero: number; celulas: string[] }[] = [];
  let celula = "";
  let registro: string[] = [];
  let dentroDeAspas = false;
  // Conta também os registros em branco: o número da linha é o que a planilha mostra.
  let numeroDoRegistro = 0;

  const fecharCelula = () => {
    registro.push(celula);
    celula = "";
  };
  const fecharRegistro = () => {
    fecharCelula();
    numeroDoRegistro++;
    if (registro.some((c) => c.trim() !== "")) registros.push({ numero: numeroDoRegistro, celulas: registro });
    registro = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        celula += c;
      }
      continue;
    }
    if (c === '"' && celula === "") {
      dentroDeAspas = true;
    } else if (c === delimitador) {
      fecharCelula();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fecharRegistro();
    } else {
      celula += c;
    }
    if (registros.length > LIMITES.linhasMaximas + 1) {
      throw new ErroSdrCore(`o arquivo passa de ${LIMITES.linhasMaximas} linhas`, 413);
    }
  }
  if (dentroDeAspas) throw new ErroSdrCore("há um campo com aspas que não fecha: confira o arquivo", 400);
  if (celula !== "" || registro.length > 0) fecharRegistro();

  if (registros.length === 0) throw new ErroSdrCore("o arquivo está vazio", 400);
  const [{ celulas: primeira }, ...dados] = registros;
  if (primeira.length > LIMITES.colunasMaximas) throw new ErroSdrCore(`o arquivo tem mais de ${LIMITES.colunasMaximas} colunas`, 400);
  if (dados.length === 0) throw new ErroSdrCore("o arquivo só tem o cabeçalho, sem nenhuma linha de dados", 400);
  if (dados.length > LIMITES.linhasMaximas) throw new ErroSdrCore(`o arquivo passa de ${LIMITES.linhasMaximas} linhas`, 413);

  // Cabeçalho com nome repetido ou vazio: ganha um sufixo para dar para mapear.
  const usados = new Map<string, number>();
  const cabecalho = primeira.map((nome, i) => {
    const base = nome.trim() || `coluna ${i + 1}`;
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  return { delimitador, cabecalho, linhas: dados };
}
