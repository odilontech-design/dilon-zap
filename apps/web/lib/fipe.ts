/**
 * Tabela FIPE, pela API pública da Parallelum (fipe.parallelum.com.br, v2).
 *
 * Não é a FIPE oficial: é um espelho mantido por terceiros, gratuito com
 * limite diário de consultas. Com `FIPE_TOKEN` no .env (cadastro grátis no
 * site deles), o limite sobe. A tabela muda uma vez por mês, então tudo fica
 * em cache de memória por 12 horas: marcas e modelos quase nunca mudam, e
 * o preço só muda na virada da referência.
 *
 * Se a API cair, a tela segue: a FIPE é ajuda para preencher e comparar, e
 * nada da revenda depende dela para funcionar.
 */

const BASE = process.env.FIPE_URL || "https://fipe.parallelum.com.br/api/v2";
const TTL_MS = 12 * 60 * 60 * 1000;

export type TipoFipe = "cars" | "motorcycles" | "trucks";
export const TIPO_FIPE: Record<"CARRO" | "MOTO" | "CAMINHAO", TipoFipe> = { CARRO: "cars", MOTO: "motorcycles", CAMINHAO: "trucks" };

export type ItemFipe = { code: string; name: string };
export type PrecoFipe = {
  codigoFipe: string;
  marca: string;
  modelo: string;
  anoModelo: number;
  combustivel: string;
  precoCents: number;
  referencia: string;
};

export class ErroFipe extends Error {}

const cache = new Map<string, { em: number; valor: unknown }>();

async function buscar<T>(caminho: string): Promise<T> {
  const guardado = cache.get(caminho);
  if (guardado && Date.now() - guardado.em < TTL_MS) return guardado.valor as T;

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.FIPE_TOKEN) headers["X-Subscription-Token"] = process.env.FIPE_TOKEN;
  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch {
    throw new ErroFipe("a tabela FIPE não respondeu agora: preencha à mão e tente de novo depois");
  }
  if (r.status === 429) throw new ErroFipe("limite diário de consultas à FIPE atingido: preencha à mão (ou configure FIPE_TOKEN)");
  if (!r.ok) throw new ErroFipe("não foi possível consultar a FIPE agora");
  const valor = (await r.json()) as T;
  cache.set(caminho, { em: Date.now(), valor });
  return valor;
}

const seguro = (s: string) => encodeURIComponent(s);

export function marcas(tipo: TipoFipe) {
  return buscar<ItemFipe[]>(`/${tipo}/brands`);
}

export function modelos(tipo: TipoFipe, marca: string) {
  return buscar<ItemFipe[]>(`/${tipo}/brands/${seguro(marca)}/models`);
}

export function anos(tipo: TipoFipe, marca: string, modelo: string) {
  return buscar<ItemFipe[]>(`/${tipo}/brands/${seguro(marca)}/models/${seguro(modelo)}/years`);
}

/** "R$ 74.900,00" → 7490000. */
export function precoFipeParaCentavos(texto: string): number | null {
  const n = Number(texto.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export async function preco(tipo: TipoFipe, marca: string, modelo: string, ano: string): Promise<PrecoFipe> {
  const r = await buscar<{
    brand: string;
    codeFipe: string;
    fuel: string;
    model: string;
    modelYear: number;
    price: string;
    referenceMonth: string;
  }>(`/${tipo}/brands/${seguro(marca)}/models/${seguro(modelo)}/years/${seguro(ano)}`);
  const centavos = precoFipeParaCentavos(r.price);
  if (centavos === null) throw new ErroFipe("a FIPE devolveu um preço que não deu para ler");
  return {
    codigoFipe: r.codeFipe,
    marca: r.brand,
    modelo: r.model,
    anoModelo: r.modelYear,
    combustivel: r.fuel,
    precoCents: centavos,
    referencia: r.referenceMonth,
  };
}
