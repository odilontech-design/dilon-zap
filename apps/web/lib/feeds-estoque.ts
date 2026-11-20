/**
 * Feeds do estoque para fora do Zap: o catálogo de veículos do Facebook e
 * Instagram (anúncios de estoque automotivo da Meta) e um XML/JSON genérico,
 * que serve a integradores e portais que importam estoque por arquivo.
 *
 * Puro: recebe os carros já filtrados pela vitrine (só o que pode ser
 * público) e devolve o texto. Teste em feeds-estoque.test-manual.ts.
 */

export type CarroDoFeed = {
  id: string;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  /** Nulo quando a loja não informou: o feed deixa em branco em vez de dizer 0 km. */
  km: number | null;
  cor: string | null;
  combustivel: string | null;
  cambio: string | null;
  portas: number | null;
  opcionais: string[];
  precoCents: number;
  descricao: string | null;
  status: string;
  diasEmEstoque: number;
  url: string;
  fotos: string[];
};

export type LojaDoFeed = { nome: string; endereco: string | null };

/** CSV com aspas onde precisa (vírgula, aspas ou quebra de linha). */
function celula(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cambioMeta(c: string | null): string {
  if (!c) return "";
  return /manual/i.test(c) ? "MANUAL" : "AUTOMATIC";
}

function combustivelMeta(c: string | null): string {
  if (!c) return "";
  const t = c.toLowerCase();
  if (t.includes("flex")) return "FLEX";
  if (t.includes("diesel")) return "DIESEL";
  if (t.includes("elétr") || t.includes("eletr")) return "ELECTRIC";
  if (t.includes("híbr") || t.includes("hibr")) return "HYBRID";
  if (t.includes("etanol")) return "FLEX";
  return "GASOLINE";
}

function titulo(c: CarroDoFeed): string {
  return [c.marca, c.modelo, c.versao, `${c.anoFabricacao}/${c.anoModelo}`].filter(Boolean).join(" ");
}

function descricao(c: CarroDoFeed): string {
  const partes = [c.descricao?.trim(), c.opcionais.length ? `Opcionais: ${c.opcionais.join(", ")}.` : ""].filter(Boolean);
  return partes.join(" ") || titulo(c);
}

const reais = (cents: number) => (cents / 100).toFixed(2);

/**
 * Catálogo de veículos da Meta (CSV). Colunas do modelo de "anúncios de
 * estoque automotivo"; o que a loja não tem (latitude, carroceria) vai vazio
 * ou com o valor genérico aceito, e o Gerenciador de Comércio aponta se
 * faltar algo para a conta dela.
 */
export function feedMetaCsv(loja: LojaDoFeed, carros: CarroDoFeed[]): string {
  const maxFotos = Math.min(Math.max(...carros.map((c) => c.fotos.length), 1), 20);
  const cabecalho = [
    "vehicle_id", "title", "description", "url", "make", "model", "year", "trim",
    "mileage.value", "mileage.unit", "price", "state_of_vehicle", "availability", "body_style",
    "exterior_color", "transmission", "fuel_type", "days_on_lot", "address.addr1",
    ...Array.from({ length: maxFotos }, (_, i) => `image[${i}].url`),
  ];
  const linhas = carros.map((c) =>
    [
      c.id, titulo(c), descricao(c), c.url, c.marca, c.modelo, c.anoModelo, c.versao,
      c.km, c.km == null ? "" : "KM", `${reais(c.precoCents)} BRL`, "USED", c.status === "RESERVADO" ? "PENDING" : "AVAILABLE", "OTHER",
      c.cor, cambioMeta(c.cambio), combustivelMeta(c.combustivel), c.diasEmEstoque, loja.endereco,
      ...Array.from({ length: maxFotos }, (_, i) => c.fotos[i] ?? ""),
    ]
      .map(celula)
      .join(",")
  );
  return [cabecalho.join(","), ...linhas].join("\n") + "\n";
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (nome: string, v: string | number | null | undefined) => (v == null || v === "" ? "" : `<${nome}>${xmlEsc(String(v))}</${nome}>`);

/** Estoque em XML genérico, para integradores que importam por arquivo. */
export function feedXml(loja: LojaDoFeed, carros: CarroDoFeed[], geradoEm: Date): string {
  const itens = carros.map(
    (c) =>
      `  <veiculo>${tag("id", c.id)}${tag("marca", c.marca)}${tag("modelo", c.modelo)}${tag("versao", c.versao)}` +
      `${tag("ano_fabricacao", c.anoFabricacao)}${tag("ano_modelo", c.anoModelo)}${tag("km", c.km)}${tag("cor", c.cor)}` +
      `${tag("combustivel", c.combustivel)}${tag("cambio", c.cambio)}${tag("portas", c.portas)}${tag("preco", reais(c.precoCents))}` +
      `${tag("situacao", c.status === "RESERVADO" ? "reservado" : "disponivel")}${tag("descricao", c.descricao)}${tag("url", c.url)}` +
      `<opcionais>${c.opcionais.map((o) => tag("opcional", o)).join("")}</opcionais>` +
      `<fotos>${c.fotos.map((f) => tag("foto", f)).join("")}</fotos></veiculo>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<estoque loja="${xmlEsc(loja.nome)}" gerado_em="${geradoEm.toISOString()}" total="${carros.length}">\n${itens.join("\n")}\n</estoque>\n`;
}

/** O mesmo em JSON. */
export function feedJson(loja: LojaDoFeed, carros: CarroDoFeed[], geradoEm: Date) {
  return {
    loja: loja.nome,
    geradoEm: geradoEm.toISOString(),
    total: carros.length,
    veiculos: carros.map((c) => ({
      id: c.id,
      marca: c.marca,
      modelo: c.modelo,
      versao: c.versao,
      anoFabricacao: c.anoFabricacao,
      anoModelo: c.anoModelo,
      km: c.km,
      cor: c.cor,
      combustivel: c.combustivel,
      cambio: c.cambio,
      portas: c.portas,
      preco: Number(reais(c.precoCents)),
      situacao: c.status === "RESERVADO" ? "reservado" : "disponivel",
      opcionais: c.opcionais,
      descricao: c.descricao,
      url: c.url,
      fotos: c.fotos,
    })),
  };
}
