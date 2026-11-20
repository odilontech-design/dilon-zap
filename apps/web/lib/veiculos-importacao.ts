/**
 * Leitura da planilha de estoque para a importação. Puro, sem banco, para ter
 * teste próprio (veiculos-importacao.test-manual.ts).
 *
 * O objetivo é aceitar a planilha que a loja JÁ tem, sem obrigá-la a montar
 * outra: os cabeçalhos são reconhecidos por vários nomes ("Preço", "Valor de
 * venda", "preco"), sem acento nem caixa, e o ano aceita "2022/2023" numa
 * coluna só. Linha ruim não impede as boas: volta com o número da linha e o
 * motivo, como a planilha mostra.
 */

import { normalizarPlaca, placaValida, reaisParaCentavos } from "./veiculos-regras";

export type CampoImportacao =
  | "marca"
  | "modelo"
  | "versao"
  | "ano"
  | "anoFabricacao"
  | "anoModelo"
  | "km"
  | "placa"
  | "cor"
  | "combustivel"
  | "cambio"
  | "portas"
  | "preco"
  | "custo"
  | "fipe"
  | "opcionais"
  | "descricao"
  | "fotos"
  | "chassi"
  | "renavam"
  | "entrada"
  | "tipo";

/** Os nomes que cada coluna pode ter, já sem acento, minúsculos e só com letras e números. */
const APELIDOS: Record<CampoImportacao, string[]> = {
  marca: ["marca", "fabricante", "montadora"],
  modelo: ["modelo", "veiculo", "carro"],
  versao: ["versao", "motorizacao", "acabamento", "descricaoversao"],
  ano: ["ano", "anofabmod", "anofabricacaomodelo", "anomod"],
  anoFabricacao: ["anofabricacao", "anofab", "fabricacao"],
  anoModelo: ["anomodelo", "modeloano"],
  km: ["km", "quilometragem", "kilometragem", "kms", "odometro"],
  placa: ["placa"],
  cor: ["cor"],
  combustivel: ["combustivel"],
  cambio: ["cambio", "transmissao"],
  portas: ["portas", "nportas", "numerodeportas"],
  preco: ["preco", "precodevenda", "valor", "valordevenda", "precovenda", "valorvenda", "precoanuncio"],
  custo: ["custo", "valordecompra", "precodecompra", "compra", "custodecompra", "valorcompra"],
  fipe: ["fipe", "valorfipe", "tabelafipe"],
  opcionais: ["opcionais", "itens", "acessorios", "equipamentos"],
  descricao: ["descricao", "observacoes", "observacao", "anuncio", "textodoanuncio", "obs"],
  fotos: ["fotos", "foto", "imagens", "imagem", "urlfotos", "linksfotos"],
  chassi: ["chassi"],
  renavam: ["renavam"],
  entrada: ["entrada", "dataentrada", "datadeentrada", "dataentradaestoque"],
  tipo: ["tipo", "categoria", "tipodeveiculo"],
};

export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Cada campo → o índice da coluna na planilha. Colunas desconhecidas ficam de fora (e são listadas). */
export function mapearColunas(cabecalho: string[]): { mapa: Partial<Record<CampoImportacao, number>>; ignoradas: string[] } {
  const mapa: Partial<Record<CampoImportacao, number>> = {};
  const ignoradas: string[] = [];
  cabecalho.forEach((bruto, i) => {
    const h = normalizarCabecalho(bruto);
    const campo = (Object.keys(APELIDOS) as CampoImportacao[]).find((c) => APELIDOS[c].includes(h));
    if (campo && mapa[campo] === undefined) mapa[campo] = i;
    else if (bruto.trim()) ignoradas.push(bruto.trim());
  });
  return { mapa, ignoradas };
}

export type LinhaImportada = {
  numero: number;
  tipo: "CARRO" | "MOTO" | "CAMINHAO";
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  placa: string | null;
  cor: string | null;
  combustivel: string | null;
  cambio: string | null;
  portas: number | null;
  precoCents: number;
  custoCents: number | null;
  fipeCents: number | null;
  opcionais: string[];
  descricao: string | null;
  fotos: string[];
  chassi: string | null;
  renavam: string | null;
  entradaEm: Date | null;
};

export type ErroDeLinha = { numero: number; erro: string };

const ANO_MIN = 1950;

function ano(s: string, agora: Date): number | null {
  const n = Number(s.trim());
  return Number.isInteger(n) && n >= ANO_MIN && n <= agora.getUTCFullYear() + 2 ? n : null;
}

/** "2022/2023", "2022-2023", "22/23" ou "2023" → [fabricação, modelo]. */
export function lerAnos(texto: string, agora = new Date()): [number, number] | null {
  const partes = texto.trim().split(/\s*[/\-]\s*/).filter(Boolean);
  const completar = (p: string) => (p.length === 2 ? `20${p}` : p);
  if (partes.length === 1) {
    const a = ano(completar(partes[0]), agora);
    return a ? [a, a] : null;
  }
  if (partes.length === 2) {
    const fab = ano(completar(partes[0]), agora);
    const mod = ano(completar(partes[1]), agora);
    return fab && mod && mod >= fab && mod - fab <= 1 ? [fab, mod] : null;
  }
  return null;
}

/** "28.500 km" → 28500. */
export function lerKm(texto: string): number | null {
  const d = texto.replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  return n <= 3_000_000 ? n : null;
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" → meio-dia UTC daquele dia. */
export function lerData(texto: string): Date | null {
  const t = texto.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return validaData(Number(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validaData(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function validaData(a: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(a, m - 1, d, 12));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Endereços de foto: separados por espaço, vírgula, ponto e vírgula, barra vertical ou quebra de linha. Só http(s). */
export function lerFotos(texto: string, maximo = 40): string[] {
  const urls = texto
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/[^\s]+$/i.test(s));
  return [...new Set(urls)].slice(0, maximo);
}

function lerTipo(texto: string): LinhaImportada["tipo"] {
  const t = normalizarCabecalho(texto);
  if (t.startsWith("moto")) return "MOTO";
  if (t.startsWith("caminh")) return "CAMINHAO";
  return "CARRO";
}

const vazioParaNulo = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

/**
 * Uma linha da planilha → o carro, ou o motivo de não dar.
 * Obrigatórios: marca, modelo, ano, km e preço (sem preço não há o que anunciar).
 */
export function lerLinha(
  numero: number,
  celulas: string[],
  mapa: Partial<Record<CampoImportacao, number>>,
  agora = new Date()
): LinhaImportada | ErroDeLinha {
  const c = (campo: CampoImportacao) => {
    const i = mapa[campo];
    return i === undefined ? "" : (celulas[i] ?? "").trim();
  };
  const falta = (o: string) => ({ numero, erro: o });

  const marca = c("marca");
  const modelo = c("modelo");
  if (!marca) return falta("sem marca");
  if (!modelo) return falta("sem modelo");

  let anos: [number, number] | null = null;
  if (c("anoFabricacao") || c("anoModelo")) {
    anos = lerAnos(`${c("anoFabricacao") || c("anoModelo")}/${c("anoModelo") || c("anoFabricacao")}`, agora);
  } else if (c("ano")) {
    anos = lerAnos(c("ano"), agora);
  }
  if (!anos) return falta(`ano inválido ou ausente ("${c("ano") || c("anoFabricacao") || c("anoModelo")}")`);

  const km = lerKm(c("km"));
  if (km === null) return falta(`quilometragem inválida ou ausente ("${c("km")}")`);

  const precoCents = reaisParaCentavos(c("preco"));
  if (!precoCents || precoCents <= 0) return falta(`preço inválido ou ausente ("${c("preco")}")`);

  const placa = normalizarPlaca(c("placa"));
  if (placa && !placaValida(placa)) return falta(`placa inválida ("${c("placa")}")`);

  const custo = c("custo") ? reaisParaCentavos(c("custo")) : null;
  if (c("custo") && (!custo || custo <= 0)) return falta(`custo inválido ("${c("custo")}")`);
  const fipe = c("fipe") ? reaisParaCentavos(c("fipe")) : null;

  const entrada = c("entrada") ? lerData(c("entrada")) : null;
  if (c("entrada") && !entrada) return falta(`data de entrada inválida ("${c("entrada")}"): use dd/mm/aaaa`);

  const portas = c("portas") ? Number(c("portas").replace(/\D/g, "")) : null;

  return {
    numero,
    tipo: lerTipo(c("tipo")),
    marca,
    modelo,
    versao: vazioParaNulo(c("versao")),
    anoFabricacao: anos[0],
    anoModelo: anos[1],
    km,
    placa,
    cor: vazioParaNulo(c("cor")),
    combustivel: vazioParaNulo(c("combustivel")),
    cambio: vazioParaNulo(c("cambio")),
    portas: portas && portas <= 9 ? portas : null,
    precoCents,
    custoCents: custo,
    fipeCents: fipe && fipe > 0 ? fipe : null,
    opcionais: [
      ...new Set(
        c("opcionais")
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.slice(0, 60))
      ),
    ].slice(0, 60),
    descricao: vazioParaNulo(c("descricao"))?.slice(0, 4000) ?? null,
    fotos: lerFotos(c("fotos")),
    chassi: vazioParaNulo(c("chassi"))?.toUpperCase().replace(/\s/g, "") ?? null,
    renavam: c("renavam").replace(/\D/g, "") || null,
    entradaEm: entrada,
  };
}

export const ehErro = (x: LinhaImportada | ErroDeLinha): x is ErroDeLinha => "erro" in x;

export type PlanilhaLida = {
  linhas: LinhaImportada[];
  erros: ErroDeLinha[];
  ignoradas: string[];
  /** Campos obrigatórios que não têm coluna na planilha (a importação nem começa). */
  faltando: string[];
};

/** A planilha já dividida em células (lerCsv) → carros e erros, com as placas repetidas no arquivo apontadas. */
export function lerPlanilha(cabecalho: string[], registros: { numero: number; celulas: string[] }[], agora = new Date()): PlanilhaLida {
  const { mapa, ignoradas } = mapearColunas(cabecalho);
  const faltando = [
    mapa.marca === undefined ? "Marca" : null,
    mapa.modelo === undefined ? "Modelo" : null,
    mapa.ano === undefined && mapa.anoFabricacao === undefined && mapa.anoModelo === undefined ? "Ano" : null,
    mapa.km === undefined ? "KM" : null,
    mapa.preco === undefined ? "Preço" : null,
  ].filter((x): x is string => !!x);
  if (faltando.length) return { linhas: [], erros: [], ignoradas, faltando };

  const linhas: LinhaImportada[] = [];
  const erros: ErroDeLinha[] = [];
  const placas = new Map<string, number>();
  for (const r of registros) {
    const l = lerLinha(r.numero, r.celulas, mapa, agora);
    if (ehErro(l)) {
      erros.push(l);
      continue;
    }
    if (l.placa && placas.has(l.placa)) {
      erros.push({ numero: l.numero, erro: `placa ${l.placa} repetida (já está na linha ${placas.get(l.placa)})` });
      continue;
    }
    if (l.placa) placas.set(l.placa, l.numero);
    linhas.push(l);
  }
  return { linhas, erros, ignoradas, faltando };
}

/** O modelo que a tela oferece para baixar. Ponto e vírgula, que é o que o Excel brasileiro abre direto. */
export const MODELO_CSV = [
  "Marca;Modelo;Versão;Ano;KM;Placa;Cor;Câmbio;Combustível;Preço;Custo;Opcionais;Descrição;Fotos;Data de entrada",
  'Volkswagen;Polo;TSI 1.0;2022/2023;28500;QWE1R23;Prata;Manual;Flex;92.900,00;78.000,00;"Ar-condicionado, Multimídia";Único dono, revisões em dia.;https://exemplo.com/foto1.jpg https://exemplo.com/foto2.jpg;05/10/2026',
  "Chevrolet;Onix;LT 1.0;2021/2022;41250;;Branco;Automático;Flex;74.900,00;;;;;",
].join("\n");
