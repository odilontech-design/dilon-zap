import { inflateRawSync } from "node:zlib";

/**
 * Leitor mínimo de planilha .xlsx (zip com XML), sem dependência nova: devolve cada aba como uma grade de
 * textos, números e datas. Só lê (valores, não fórmulas) e só o que uma planilha de controle usa: células de
 * texto, número, data, texto compartilhado e embutido. Feito para o importador de vendas (lib/importar-vendas.ts).
 * Planilha maliciosa: limites de tamanho e de linhas protegem a memória (zip bomb).
 */

export type Celula = string | number | Date | null;
export type AbaLida = { nome: string; linhas: Celula[][] };

const MAX_BYTES_DESCOMPRIMIDOS = 60_000_000;
const MAX_LINHAS_POR_ABA = 20_000;

export class ErroXlsx extends Error {}

function entradasDoZip(buf: Buffer): Map<string, () => Buffer> {
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás para frente.
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new ErroXlsx("o arquivo não é uma planilha .xlsx (zip inválido)");
  const total = buf.readUInt16LE(fim + 10);
  let pos = buf.readUInt32LE(fim + 16);
  const mapa = new Map<string, () => Buffer>();
  let descomprimido = 0;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new ErroXlsx("zip corrompido");
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComprimido = buf.readUInt32LE(pos + 20);
    const tamReal = buf.readUInt32LE(pos + 24);
    const nomeLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const comentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    const nome = buf.subarray(pos + 46, pos + 46 + nomeLen).toString("utf8");
    pos += 46 + nomeLen + extraLen + comentLen;
    descomprimido += tamReal;
    if (descomprimido > MAX_BYTES_DESCOMPRIMIDOS) throw new ErroXlsx("a planilha é grande demais");
    mapa.set(nome, () => {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const dados = buf.subarray(ini, ini + tamComprimido);
      return metodo === 0 ? Buffer.from(dados) : metodo === 8 ? inflateRawSync(dados) : (() => { throw new ErroXlsx("compressão do zip não suportada"); })();
    });
  }
  return mapa;
}

const entidades = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Todo o texto de um bloco <si>/<is> (junta as partes de texto formatado). */
const textoDoBloco = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entidades(m[1])).join("");

const letrasParaColuna = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Número de série do Excel (dias desde 30/12/1899) em data. */
export const dataDoSerialExcel = (n: number): Date => new Date(Math.round((n - 25569) * 86_400_000));

export function lerXlsx(buf: Buffer): AbaLida[] {
  const z = entradasDoZip(buf);
  const ler = (nome: string) => z.get(nome)?.().toString("utf8") ?? null;
  const livro = ler("xl/workbook.xml");
  if (!livro) throw new ErroXlsx("o arquivo não parece uma planilha do Excel");
  const rels = new Map<string, string>();
  for (const m of (ler("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const alvo = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && alvo) rels.set(id, alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.?\//, "")}`);
  }
  const compartilhadas = [...(ler("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoDoBloco(m[1]));

  const abas: AbaLida[] = [];
  for (const m of livro.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = entidades(m[0].match(/\bname="([^"]*)"/)?.[1] ?? "");
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1];
    const caminho = rid ? rels.get(rid) : null;
    const xml = caminho ? ler(caminho) : null;
    if (!xml) continue;
    const linhas: Celula[][] = [];
    for (const lm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const numero = Number(lm[1].match(/\br="(\d+)"/)?.[1] ?? linhas.length + 1);
      if (numero > MAX_LINHAS_POR_ABA) break;
      const linha: Celula[] = [];
      for (const cm of lm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = cm[1].match(/\br="([A-Z]+\d+)"/)?.[1];
        if (!ref) continue;
        const tipo = cm[1].match(/\bt="([^"]+)"/)?.[1];
        const corpo = cm[2] ?? "";
        const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let valor: Celula = null;
        if (tipo === "s" && v !== undefined) valor = compartilhadas[Number(v)] ?? null;
        else if (tipo === "inlineStr") valor = textoDoBloco(corpo);
        else if (tipo === "str" && v !== undefined) valor = entidades(v);
        else if (tipo === "d" && v) valor = new Date(v);
        else if (tipo === "b" || tipo === "e") valor = null;
        else if (v !== undefined && v !== "") valor = Number(v);
        linha[letrasParaColuna(ref)] = valor === "" ? null : valor;
      }
      linhas[numero - 1] = Array.from(linha, (c) => c ?? null);
    }
    abas.push({ nome, linhas: Array.from(linhas, (l) => l ?? []) });
  }
  return abas;
}
