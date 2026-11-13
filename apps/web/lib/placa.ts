import { prisma } from "@dilon-zap/db";
import { normalizarPlaca, placaValida } from "@/lib/veiculos-regras";
import { consultarPlacaMobiauto } from "@/lib/portais-mobiauto";

/**
 * Busca pela placa: preenche marca, modelo, versão, anos, cor, combustível, câmbio, chassi,
 * renavam e código FIPE a partir de um provedor de dados de veículo. Só características do
 * carro; nenhum dado do proprietário é pedido nem guardado.
 *
 * Provedores, na ordem:
 *  1. Um provedor HTTP configurado por variável: `PLACA_API_URL` com `{placa}` no lugar da
 *     placa (o token pode ir na própria URL), e `PLACA_API_HEADERS` (JSON) se precisar de cabeçalho.
 *     A resposta é lida de forma tolerante (nomes em português ou inglês, em qualquer nível).
 *  2. A MobiAuto, se a loja tem a conta conectada (marca, modelo, versão, ano, combustível, chassi, FIPE).
 * Resultado com sucesso fica em cache (`ConsultaPlaca`) por 90 dias.
 */

export type DadosDaPlaca = {
  marca?: string;
  modelo?: string;
  versao?: string;
  anoFabricacao?: number;
  anoModelo?: number;
  cor?: string;
  combustivel?: string;
  cambio?: string;
  portas?: number;
  chassi?: string;
  renavam?: string;
  codigoFipe?: string;
};

export type ResultadoPlaca = { ok: true; origem: string; dados: DadosDaPlaca; doCache: boolean } | { ok: false; erro: string; semProvedor?: boolean };

const TTL_MS = 90 * 86_400_000;

// ---------------------------------------------------------------------------------------------
// Leitura tolerante da resposta de um provedor
// ---------------------------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Todos os valores simples da resposta, por nome em minúsculo sem símbolos; o primeiro de cada nome (o mais raso) vence. */
export function achatar(obj: unknown, profundidade = 0, saida: Map<string, string> = new Map()): Map<string, string> {
  if (!obj || typeof obj !== "object" || profundidade > 3) return saida;
  const itens = Array.isArray(obj) ? obj.slice(0, 1).map((v, i) => [String(i), v] as [string, unknown]) : Object.entries(obj as Record<string, unknown>);
  const filhos: unknown[] = [];
  for (const [k, v] of itens) {
    if (v !== null && typeof v === "object") filhos.push(v);
    else if (v !== null && v !== undefined && String(v).trim() !== "") {
      const nome = semAcento(k).replace(/[^a-z0-9]/g, "");
      if (!saida.has(nome)) saida.set(nome, String(v).trim());
    }
  }
  for (const f of filhos) achatar(f, profundidade + 1, saida);
  return saida;
}

const pega = (m: Map<string, string>, ...nomes: string[]) => nomes.map((n) => m.get(n)).find((v) => v && v !== "0");

const maiusculas = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s/-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase()) : t);

const COMBUSTIVEL: [RegExp, string][] = [[/flex|alcool.*gasolina|gasolina.*alcool|gasolina\/etanol|etanol\/gasolina/, "Flex"], [/hibrid/, "Híbrido"], [/eletric/, "Elétrico"], [/diesel/, "Diesel"], [/gnv/, "GNV"], [/etanol|alcool/, "Etanol"], [/gasolina/, "Gasolina"]];
const CAMBIO: [RegExp, string][] = [[/automatizad/, "Automatizado"], [/cvt/, "CVT"], [/autom/, "Automático"], [/manual/, "Manual"]];
const traduzir = (t: string | undefined, tabela: [RegExp, string][]) => (t ? tabela.find(([re]) => re.test(semAcento(t)))?.[1] : undefined);
const ano = (t: string | undefined) => {
  const n = Number((t ?? "").match(/(19|20)\d{2}/)?.[0]);
  return Number.isFinite(n) && n >= 1950 && n <= new Date().getFullYear() + 2 ? n : undefined;
};

/** Converte a resposta (JSON) de um provedor qualquer nos campos da ficha. Sem marca e modelo, devolve null. */
export function lerRespostaDeProvedor(json: unknown): DadosDaPlaca | null {
  const m = achatar(json);
  let marca = pega(m, "marca", "make", "makename", "brand", "fabricante");
  let modelo = pega(m, "modelo", "model", "modelname", "nomemodelo");
  // "CHEVROLET/PRISMA 1.4MT LT": marca antes da barra, modelo depois.
  if (modelo?.includes("/")) {
    const [antes, depois] = modelo.split("/", 2);
    marca ??= antes.trim();
    modelo = depois.trim();
  }
  if (!marca && !modelo) return null;
  const fab = ano(pega(m, "anofabricacao", "ano", "yearmanufacture", "manufactureyear", "productionyear", "anofab"));
  const mod = ano(pega(m, "anomodelo", "modelyear", "anomod", "ano"));
  const portas = Number(pega(m, "portas", "numeroportas", "doors", "nrportas"));
  const dados: DadosDaPlaca = {
    ...(marca ? { marca: maiusculas(marca) } : {}),
    ...(modelo ? { modelo: maiusculas(modelo) } : {}),
    ...(pega(m, "versao", "submodelo", "trim", "trimname", "version", "variante") ? { versao: pega(m, "versao", "submodelo", "trim", "trimname", "version", "variante")! } : {}),
    ...(fab ? { anoFabricacao: fab } : {}),
    ...(mod ? { anoModelo: mod } : {}),
    ...(pega(m, "cor", "color", "colorname") ? { cor: maiusculas(pega(m, "cor", "color", "colorname")!) } : {}),
    ...(traduzir(pega(m, "combustivel", "fuel", "fuelname", "tipocombustivel"), COMBUSTIVEL) ? { combustivel: traduzir(pega(m, "combustivel", "fuel", "fuelname", "tipocombustivel"), COMBUSTIVEL)! } : {}),
    ...(traduzir(pega(m, "cambio", "transmissao", "transmission", "tipocambio"), CAMBIO) ? { cambio: traduzir(pega(m, "cambio", "transmissao", "transmission", "tipocambio"), CAMBIO)! } : {}),
    ...(portas >= 2 && portas <= 5 ? { portas } : {}),
    ...(pega(m, "chassi", "chassis", "vin") ? { chassi: pega(m, "chassi", "chassis", "vin")!.toUpperCase() } : {}),
    ...(pega(m, "renavam") ? { renavam: pega(m, "renavam")! } : {}),
    ...(pega(m, "codigofipe", "fipecode", "fipeid", "fipe", "codigofipe1") ? { codigoFipe: pega(m, "codigofipe", "fipecode", "fipeid", "fipe", "codigofipe1")! } : {}),
  };
  return dados;
}

// ---------------------------------------------------------------------------------------------
// Provedores
// ---------------------------------------------------------------------------------------------

export const provedorDePlacaConfigurado = () => !!process.env.PLACA_API_URL;

async function provedorHttp(placa: string): Promise<DadosDaPlaca | null | undefined> {
  const modelo = process.env.PLACA_API_URL;
  if (!modelo) return undefined; // sem provedor configurado
  let cabecalhos: Record<string, string> = {};
  try {
    cabecalhos = process.env.PLACA_API_HEADERS ? JSON.parse(process.env.PLACA_API_HEADERS) : {};
  } catch {
    // cabeçalhos inválidos: segue sem
  }
  const r = await fetch(modelo.replace("{placa}", encodeURIComponent(placa)), { headers: { Accept: "application/json", ...cabecalhos }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`O provedor de placas respondeu ${r.status}`);
  return lerRespostaDeProvedor(await r.json().catch(() => null));
}

export async function consultarPlaca(tenantId: string, entrada: string): Promise<ResultadoPlaca> {
  const placa = normalizarPlaca(entrada);
  if (!placa || !placaValida(placa)) return { ok: false, erro: "Placa inválida: use o formato ABC1D23 (ou ABC-1234)." };

  const guardada = await prisma.consultaPlaca.findUnique({ where: { placa } });
  if (guardada && Date.now() - guardada.consultadaEm.getTime() < TTL_MS) return { ok: true, origem: guardada.origem, dados: guardada.dados as DadosDaPlaca, doCache: true };

  let tentou = false;
  let ultimoErro: string | null = null;
  const tentativas: [string, () => Promise<DadosDaPlaca | null | undefined>][] = [
    ["provedor", () => provedorHttp(placa)],
    ["mobiauto", () => consultarPlacaMobiauto(tenantId, placa)],
  ];
  for (const [origem, buscar] of tentativas) {
    try {
      const dados = await buscar();
      if (dados === undefined) continue; // sem este provedor para a loja
      tentou = true;
      if (dados && (dados.marca || dados.modelo)) {
        await prisma.consultaPlaca.upsert({ where: { placa }, create: { placa, origem, dados: dados as object }, update: { origem, dados: dados as object, consultadaEm: new Date() } });
        return { ok: true, origem, dados, doCache: false };
      }
    } catch (e) {
      tentou = true;
      ultimoErro = e instanceof Error ? e.message : "falha na consulta";
    }
  }
  if (!tentou) return { ok: false, semProvedor: true, erro: "A busca pela placa ainda não está liberada nesta conta. Preencha os dados à mão." };
  return { ok: false, erro: ultimoErro ?? "Não encontramos essa placa. Preencha os dados à mão." };
}
