/**
 * Contas do painel gerencial (Believe, 20/11). Puro, sem banco, para poder testar.
 *
 * O mês é o do calendário em horário de Brasília (UTC−3, sem horário de
 * verão desde 2019): uma venda fechada às 22h do dia 31 pertence ao mês que
 * acaba, não ao seguinte — que é o que o servidor, em UTC, contaria.
 */

const BRT_MS = 3 * 60 * 60 * 1000;

export type JanelaDoMes = {
  /** Início do mês atual (inclusive), em UTC. */
  inicio: Date;
  /** Início do mês seguinte (exclusivo). */
  fim: Date;
  /** Início do mês anterior. */
  inicioAnterior: Date;
  diasNoMes: number;
  /** Dia do mês em Brasília (1 a diasNoMes). */
  diaDoMes: number;
  /** "2026-11" — para o rótulo. */
  mes: string;
};

export function janelaDoMes(agora = new Date()): JanelaDoMes {
  const brt = new Date(agora.getTime() - BRT_MS);
  const ano = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  return {
    inicio: new Date(Date.UTC(ano, m, 1) + BRT_MS),
    fim: new Date(Date.UTC(ano, m + 1, 1) + BRT_MS),
    inicioAnterior: new Date(Date.UTC(ano, m - 1, 1) + BRT_MS),
    diasNoMes: new Date(Date.UTC(ano, m + 1, 0)).getUTCDate(),
    diaDoMes: brt.getUTCDate(),
    mes: `${ano}-${String(m + 1).padStart(2, "0")}`,
  };
}

/** Variação em % sobre o período anterior; null quando não há base de comparação. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export function ticketMedio(totalCents: number, pedidos: number): number {
  return pedidos > 0 ? Math.round(totalCents / pedidos) : 0;
}

export type ProgressoDaMeta = {
  metaCents: number;
  /** % já realizado, sem teto (passou da meta = mais de 100). */
  percentual: number;
  faltaCents: number;
  /** Projeção linear do mês pelo ritmo até hoje. */
  projecaoCents: number;
  /** Se a projeção bate a meta. */
  noRitmo: boolean;
};

/** null sem meta definida (ou meta zero): o painel mostra só o realizado. */
export function progressoDaMeta(
  realizadoCents: number,
  metaCents: number | null | undefined,
  diaDoMes: number,
  diasNoMes: number
): ProgressoDaMeta | null {
  if (!metaCents || metaCents <= 0) return null;
  const projecaoCents = diaDoMes > 0 ? Math.round((realizadoCents / diaDoMes) * diasNoMes) : realizadoCents;
  return {
    metaCents,
    percentual: Math.round((realizadoCents / metaCents) * 100),
    faltaCents: Math.max(0, metaCents - realizadoCents),
    projecaoCents,
    noRitmo: projecaoCents >= metaCents,
  };
}

/** Estoque considerado baixo: de 1 até este número de unidades. Zero é "esgotado", à parte. */
export const LIMITE_ESTOQUE_BAIXO = 5;
