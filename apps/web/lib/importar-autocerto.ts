import { decodificar } from "@/lib/importar-site";
import { lerData } from "@/lib/veiculos-importacao";
import { normalizarPlaca, placaValida } from "@/lib/veiculos-regras";

/**
 * Leitor da planilha de estoque que o AutoCerto exporta (Estoque → exportar).
 * Ela vem como uma tabela HTML com extensão .xls, em Latin-1, e sem <tr>: as
 * células seguem em sequência, uma linha a cada N colunas. Puro (recebe o texto
 * e devolve linhas); quem grava no banco é lib/importar-autocerto-estoque.ts.
 *
 * Por que ela existe: o site do AutoCerto não publica placa, preço ("Sob
 * Consulta") nem a data de cadastro, mas a planilha tem. O preço que a loja usa
 * nos portais está em "Preço Classificados"; o "Preço" do site costuma ser 0.
 */

export type LinhaAutoCerto = {
  numero: number;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  placa: string | null;
  cor: string | null;
  /** Nulo quando a planilha diz 0 (o AutoCerto costuma não ter a km). */
  km: number | null;
  combustivel: string | null;
  /** O preço dos classificados; se não houver, o do site. 0 = sem preço. */
  precoCents: number;
  fipeCents: number | null;
  cadastro: Date | null;
};

export const normalizarTexto = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const semTags = (h: string) => decodificar(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** "R$ 35.999,99" → 3599999. Vazio ou lixo → 0. */
export function dinheiroEmCentavos(t: string): number {
  const m = t.replace(/[^\d,]/g, "").match(/^(\d+)(?:,(\d{1,2}))?$/);
  if (!m) return 0;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
}

function colunas(cab: string[]) {
  // Arquivo lido com a codificação errada troca o "ç" por "�" (que some na normalização): "Pre o".
  const n = cab.map(normalizarTexto).map((c) => c.replace(/^pre o\b/, "preco"));
  const acha = (...prefixos: string[]) => n.findIndex((c) => prefixos.some((p) => c === p || c.startsWith(p)));
  return {
    marca: acha("marca"),
    modelo: acha("modelo"),
    versao: acha("vers"),
    ano: acha("ano"),
    placa: acha("placa"),
    cor: acha("cor"),
    km: acha("km"),
    combustivel: acha("combust"),
    // "Preço Classificados" começa com "preco class"; o "Preço" do site é só "preco".
    precoSite: n.findIndex((c) => c === "preco"),
    precoClassificados: acha("preco class"),
    fipe: acha("valor fipe", "fipe"),
    cadastro: acha("data cadastro", "cadastro"),
  };
}

export function lerPlanilhaAutoCerto(texto: string): { linhas: LinhaAutoCerto[]; erros: { numero: number; erro: string }[]; faltando: string[] } {
  const cab = [...texto.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => semTags(m[1]));
  const c = colunas(cab);
  const faltando = (["marca", "modelo", "ano", "placa"] as const).filter((k) => c[k] < 0);
  if (!cab.length || faltando.length) return { linhas: [], erros: [], faltando: faltando.length ? faltando : ["cabeçalho"] };

  const celulas = [...texto.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => semTags(m[1]));
  const linhas: LinhaAutoCerto[] = [];
  const erros: { numero: number; erro: string }[] = [];
  for (let i = 0, numero = 1; i + cab.length <= celulas.length; i += cab.length, numero++) {
    const r = celulas.slice(i, i + cab.length);
    const v = (k: keyof typeof c) => (c[k] >= 0 ? r[c[k]] ?? "" : "");
    const anos = v("ano").match(/(\d{4})\s*\/\s*(\d{4})/) ?? v("ano").match(/^(\d{4})$/);
    if (!v("marca") || !v("modelo") || !anos) {
      erros.push({ numero, erro: "sem marca, modelo ou ano" });
      continue;
    }
    const placa = normalizarPlaca(v("placa"));
    const km = Number(v("km").replace(/\D/g, ""));
    const classificados = c.precoClassificados >= 0 ? dinheiroEmCentavos(v("precoClassificados")) : 0;
    const fipe = c.fipe >= 0 ? dinheiroEmCentavos(v("fipe")) : 0;
    linhas.push({
      numero,
      marca: v("marca"),
      modelo: v("modelo"),
      versao: v("versao") || null,
      anoFabricacao: Number(anos[1]),
      anoModelo: Number(anos[2] ?? anos[1]),
      placa: placa && placaValida(placa) ? placa : null,
      cor: v("cor") || null,
      km: km > 0 ? km : null,
      combustivel: v("combustivel") || null,
      precoCents: classificados > 0 ? classificados : c.precoSite >= 0 ? dinheiroEmCentavos(v("precoSite")) : 0,
      fipeCents: fipe > 0 ? fipe : null,
      cadastro: v("cadastro") ? lerData(v("cadastro")) : null,
    });
  }
  return { linhas, erros, faltando: [] };
}

/** A chave que identifica o mesmo carro no site e na planilha: o site só mostra o ano do modelo. */
export function chaveDoCarro(c: { marca: string; modelo: string; versao: string | null; anoModelo: number; cor: string | null }): string {
  return [c.marca, c.modelo, c.versao ?? "", String(c.anoModelo), c.cor ?? ""].map(normalizarTexto).join("|");
}
