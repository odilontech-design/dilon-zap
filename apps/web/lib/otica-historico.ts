/**
 * Histórico das OS da ótica com indicadores (Visuallis, 23/11). Puro, sem
 * banco, para poder testar: o servidor lê as OS entregues e canceladas e estas
 * funções filtram, somam e agrupam.
 *
 * A regra que mais importa: os indicadores e a lista saem do MESMO conjunto
 * filtrado. O que o Alef reclamou no Financeiro foi justamente números que não
 * acompanhavam o filtro — aqui, quem conta e quem lista usam a mesma função.
 *
 * Datas em horário de Brasília (UTC−3): uma OS entregue às 22h do dia 30
 * pertence ao mês que acaba, não ao seguinte.
 */

const BRT_MS = 3 * 60 * 60 * 1000;

export type OSDoHistorico = {
  id: string;
  numero: number;
  etapa: "ENTREGUE" | "CANCELADA";
  historica: boolean;
  entregueEm: Date | null;
  canceladaEm: Date | null;
  previsaoEntrega: Date | null;
  createdAt: Date;
  valorCents: number;
  /** Do que já entrou nas parcelas da conta a receber da OS. */
  recebidoCents: number;
  saldoCents: number;
  /** OS sem conta a receber: o valor existe, mas o Financeiro não tem lançamento. */
  semLancamento: boolean;
  laboratorio: { id: string; nome: string } | null;
  consultor: { id: string; nome: string } | null;
  materialLente: string | null;
};

/**
 * A data que posiciona a OS no tempo: a da entrega, ou a do cancelamento. As
 * antigas do papel sem nenhuma das duas caem na previsão e, por fim, na criação.
 */
export function dataDaOS(o: Pick<OSDoHistorico, "entregueEm" | "canceladaEm" | "previsaoEntrega" | "createdAt">): Date {
  return o.entregueEm ?? o.canceladaEm ?? o.previsaoEntrega ?? o.createdAt;
}

export type FiltrosDoHistorico = {
  de?: Date;
  ate?: Date;
  situacao: "todas" | "entregues" | "canceladas";
  laboratorioId?: string;
  consultorId?: string;
  origem: "todas" | "papel" | "sistema";
  financeiro: "todas" | "quitadas" | "com-saldo" | "sem-lancamento";
};

export const SEM_FILTROS: FiltrosDoHistorico = { situacao: "todas", origem: "todas", financeiro: "todas" };

export function passaNoFiltro(o: OSDoHistorico, f: FiltrosDoHistorico): boolean {
  const data = dataDaOS(o).getTime();
  if (f.de && data < f.de.getTime()) return false;
  if (f.ate && data > f.ate.getTime()) return false;
  if (f.situacao === "entregues" && o.etapa !== "ENTREGUE") return false;
  if (f.situacao === "canceladas" && o.etapa !== "CANCELADA") return false;
  if (f.laboratorioId && o.laboratorio?.id !== f.laboratorioId) return false;
  if (f.consultorId && o.consultor?.id !== f.consultorId) return false;
  if (f.origem === "papel" && !o.historica) return false;
  if (f.origem === "sistema" && o.historica) return false;
  if (f.financeiro === "sem-lancamento" && !o.semLancamento) return false;
  if (f.financeiro === "com-saldo" && !(o.saldoCents > 0)) return false;
  if (f.financeiro === "quitadas" && !(o.valorCents > 0 && !o.semLancamento && o.saldoCents <= 0)) return false;
  return true;
}

export type ResumoDoHistorico = {
  /** Todas as OS do filtro, entregues e canceladas. */
  total: number;
  entregues: number;
  canceladas: number;
  /** Das OS do filtro, % canceladas; null sem nenhuma OS. */
  taxaDeCancelamento: number | null;
  /** Soma do valor das ENTREGUES. Cancelada não é faturamento. */
  faturamentoCents: number;
  /** Faturamento ÷ entregues com valor lançado. */
  ticketMedioCents: number;
  recebidoCents: number;
  /** O que ainda falta receber das entregues. */
  saldoCents: number;
  entreguesComSaldo: number;
  /** Entregues com valor mas sem conta a receber: não dá para saber o que foi pago. */
  semLancamento: number;
  /**
   * O valor dessas OS. Faturamento = recebido + a receber + sem lançamento: sem esta
   * parcela os números não fecham, e quem confere contra o Financeiro acha que errou.
   */
  semLancamentoCents: number;
};

export function resumirHistorico(ordens: OSDoHistorico[]): ResumoDoHistorico {
  const entregues = ordens.filter((o) => o.etapa === "ENTREGUE");
  const canceladas = ordens.length - entregues.length;
  const comValor = entregues.filter((o) => o.valorCents > 0);
  const faturamentoCents = entregues.reduce((s, o) => s + o.valorCents, 0);
  return {
    total: ordens.length,
    entregues: entregues.length,
    canceladas,
    taxaDeCancelamento: ordens.length ? Math.round((canceladas / ordens.length) * 100) : null,
    faturamentoCents,
    ticketMedioCents: comValor.length ? Math.round(faturamentoCents / comValor.length) : 0,
    recebidoCents: entregues.reduce((s, o) => s + o.recebidoCents, 0),
    saldoCents: entregues.reduce((s, o) => s + o.saldoCents, 0),
    entreguesComSaldo: entregues.filter((o) => o.saldoCents > 0).length,
    semLancamento: comValor.filter((o) => o.semLancamento).length,
    semLancamentoCents: comValor.filter((o) => o.semLancamento).reduce((s, o) => s + o.valorCents, 0),
  };
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function emBrasilia(d: Date) {
  const b = new Date(d.getTime() - BRT_MS);
  return { ano: b.getUTCFullYear(), mes: b.getUTCMonth() };
}

export type PontoDoPeriodo = { chave: string; rotulo: string; entregues: number; faturamentoCents: number };

/**
 * Por mês quando o filtro cobre até dois anos; por ano acima disso — o
 * histórico das OS do papel vai de 2015 a hoje, e 120 barras de mês não se leem.
 */
export function escolherGranularidade(ordens: OSDoHistorico[]): "mes" | "ano" {
  if (!ordens.length) return "mes";
  const datas = ordens.map((o) => dataDaOS(o).getTime());
  const a = emBrasilia(new Date(Math.min(...datas)));
  const b = emBrasilia(new Date(Math.max(...datas)));
  const meses = (b.ano - a.ano) * 12 + (b.mes - a.mes) + 1;
  return meses > 24 ? "ano" : "mes";
}

/** Entregues e faturamento por período, em ordem cronológica e SEM buracos (mês sem OS aparece zerado). */
export function agruparPorPeriodo(ordens: OSDoHistorico[], granularidade: "mes" | "ano"): PontoDoPeriodo[] {
  const entregues = ordens.filter((o) => o.etapa === "ENTREGUE");
  if (!entregues.length) return [];

  const mapa = new Map<string, PontoDoPeriodo>();
  const chaveDe = (ano: number, mes: number) => (granularidade === "ano" ? String(ano) : `${ano}-${String(mes + 1).padStart(2, "0")}`);
  const rotuloDe = (ano: number, mes: number) => (granularidade === "ano" ? String(ano) : `${MESES_CURTOS[mes]}/${String(ano).slice(2)}`);

  for (const o of entregues) {
    const { ano, mes } = emBrasilia(dataDaOS(o));
    const chave = chaveDe(ano, mes);
    const p = mapa.get(chave) ?? { chave, rotulo: rotuloDe(ano, mes), entregues: 0, faturamentoCents: 0 };
    p.entregues += 1;
    p.faturamentoCents += o.valorCents;
    mapa.set(chave, p);
  }

  const datas = entregues.map((o) => emBrasilia(dataDaOS(o)));
  const inicio = datas.reduce((a, b) => (b.ano * 12 + b.mes < a.ano * 12 + a.mes ? b : a));
  const fim = datas.reduce((a, b) => (b.ano * 12 + b.mes > a.ano * 12 + a.mes ? b : a));

  const pontos: PontoDoPeriodo[] = [];
  if (granularidade === "ano") {
    for (let ano = inicio.ano; ano <= fim.ano; ano++) {
      pontos.push(mapa.get(chaveDe(ano, 0)) ?? { chave: chaveDe(ano, 0), rotulo: rotuloDe(ano, 0), entregues: 0, faturamentoCents: 0 });
    }
  } else {
    let ano = inicio.ano;
    let mes = inicio.mes;
    while (ano * 12 + mes <= fim.ano * 12 + fim.mes) {
      pontos.push(mapa.get(chaveDe(ano, mes)) ?? { chave: chaveDe(ano, mes), rotulo: rotuloDe(ano, mes), entregues: 0, faturamentoCents: 0 });
      mes += 1;
      if (mes > 11) {
        mes = 0;
        ano += 1;
      }
    }
  }
  return pontos;
}

export type LinhaDeRanking = { nome: string; entregues: number; faturamentoCents: number };

/** Quem mais vendeu: agrupa as ENTREGUES por uma característica. "Não informado" fica no fim, qualquer que seja o valor. */
export function rankingPor(
  ordens: OSDoHistorico[],
  nomeDe: (o: OSDoHistorico) => string | null,
  limite = 8
): LinhaDeRanking[] {
  const mapa = new Map<string, LinhaDeRanking>();
  for (const o of ordens) {
    if (o.etapa !== "ENTREGUE") continue;
    const nome = nomeDe(o)?.trim() || "Não informado";
    const l = mapa.get(nome) ?? { nome, entregues: 0, faturamentoCents: 0 };
    l.entregues += 1;
    l.faturamentoCents += o.valorCents;
    mapa.set(nome, l);
  }
  const todas = [...mapa.values()];
  const ordenar = (a: LinhaDeRanking, b: LinhaDeRanking) => b.faturamentoCents - a.faturamentoCents || b.entregues - a.entregues || a.nome.localeCompare(b.nome, "pt-BR");
  const informadas = todas.filter((l) => l.nome !== "Não informado").sort(ordenar);
  const semInfo = todas.filter((l) => l.nome === "Não informado");
  return [...informadas.slice(0, limite), ...semInfo];
}

/** "2026-11-18" → começo/fim desse dia em Brasília; inválido → undefined. */
export function inicioDoDia(dia: string | null | undefined): Date | undefined {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return undefined;
  const d = new Date(`${dia}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function fimDoDia(dia: string | null | undefined): Date | undefined {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return undefined;
  const d = new Date(`${dia}T23:59:59.999-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
