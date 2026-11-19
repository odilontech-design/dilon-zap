import { MAX_PARCELAS } from "@dilon-zap/receivables";

/**
 * Simulação de parcelamento do orçamento (Believe, 19/11/2026): quem monta o orçamento escolhe a entrada, o número
 * de parcelas, a periodicidade e a data da 1ª parcela, e o orçamento que a cliente recebe mostra como fica cada
 * parcela. Puro e sem banco, para ter teste: a tela, a prévia e o envio leem a simulação por aqui, então os três
 * validam do mesmo jeito.
 */
export type SimulacaoDoParcelamento = {
  entradaCents: number;
  numParcelas: number;
  periodicidade: "SEMANAL" | "QUINZENAL" | "MENSAL";
  /** Dia no formato AAAA-MM-DD. */
  primeiroVencimento: string;
};

const PERIODICIDADES = ["SEMANAL", "QUINZENAL", "MENSAL"] as const;

/** Lê e valida; qualquer coisa fora do esperado vira null (orçamento sai sem a simulação, não com lixo). */
export function lerSimulacao(bruto: unknown): SimulacaoDoParcelamento | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const entradaCents = Number(b.entradaCents ?? 0);
  const numParcelas = Number(b.numParcelas);
  const periodicidade = b.periodicidade;
  const dia = typeof b.primeiroVencimento === "string" ? b.primeiroVencimento : "";
  if (!Number.isInteger(entradaCents) || entradaCents < 0 || entradaCents > 1_000_000_000) return null;
  if (!Number.isInteger(numParcelas) || numParcelas < 1 || numParcelas > MAX_PARCELAS) return null;
  if (!PERIODICIDADES.includes(periodicidade as never)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(new Date(`${dia}T12:00:00Z`).getTime())) return null;
  return { entradaCents, numParcelas, periodicidade: periodicidade as SimulacaoDoParcelamento["periodicidade"], primeiroVencimento: dia };
}

/** Parâmetros da prévia (?simEntrada=...&simParcelas=...). Sem simParcelas, não há simulação. */
export function simulacaoDaBusca(busca: URLSearchParams): SimulacaoDoParcelamento | null {
  if (!busca.has("simParcelas")) return null;
  return lerSimulacao({
    entradaCents: Number(busca.get("simEntrada") || 0),
    numParcelas: Number(busca.get("simParcelas")),
    periodicidade: busca.get("simPeriodicidade"),
    primeiroVencimento: busca.get("simVencimento"),
  });
}

/** O inverso, para a tela montar a query da prévia. */
export function simulacaoParaBusca(s: SimulacaoDoParcelamento): Record<string, string> {
  return {
    simEntrada: String(s.entradaCents),
    simParcelas: String(s.numParcelas),
    simPeriodicidade: s.periodicidade,
    simVencimento: s.primeiroVencimento,
  };
}
