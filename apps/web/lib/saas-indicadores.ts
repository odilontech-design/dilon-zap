/**
 * Indicadores de SaaS: puro, sem banco e sem tela — pelo mesmo motivo de
 * funil-indicadores.ts. MRR, CAC e LTV errados parecem certos, e viram decisão
 * de quanto investir em anúncio.
 *
 * Escolhas de método que o resto do arquivo só aplica:
 *
 *  1. O TOPO DO FUNIL É INFORMADO À MÃO. Visitantes e investimento em anúncio
 *     não nascem no sistema; alguém digita por mês. O resto sai das negociações.
 *
 *  2. LEADS E SQLs SÃO COORTE, CLIENTES SÃO DO PERÍODO.
 *       leads    = negociações CRIADAS no mês;
 *       SQLs     = dessas, as que já passaram da etapa de qualificação;
 *       clientes = negociações GANHAS com fechamento no mês.
 *     Cliente é do mês em que fechou, não do mês em que o lead nasceu: é assim
 *     que o caixa e o MRR enxergam a venda. Por isso a conversão "total" de um
 *     mês compara coisas de safras diferentes — num mês só é aproximada, e em
 *     janelas longas converge para a taxa real.
 *
 *  3. MRR É ACUMULADO. MRR do fim do mês = MRR do início + MRR novo − MRR
 *     cancelado. O início vem do ponto de partida informado (quem já tinha
 *     clientes antes do sistema) e, depois dele, do fim do mês anterior.
 *
 *  4. MÊS É MÊS DE BRASÍLIA. Uma venda fechada às 22h do dia 30 em São Paulo já
 *     é 01:00 do dia seguinte em UTC; contá-la no mês seguinte moveria receita
 *     de um mês para o outro. Brasil não tem horário de verão desde 2019, então
 *     um deslocamento fixo de -3h basta.
 */

import type { EventoIn, NegociacaoIn } from "./funil-indicadores";

export type MesInformado = {
  mes: string; // "2026-10"
  visitantes: number;
  investimentoCents: number;
  cancelamentos: number;
  mrrCanceladoCents: number;
  mrrInicialCents: number | null;
};

export type LinhaDoMes = {
  mes: string;
  visitantes: number;
  investimentoCents: number;
  leads: number;
  sqls: number;
  clientes: number;
  /** Clientes novos que entraram com cobrança mensal. */
  clientesMensais: number;
  novoMrrCents: number;
  cancelamentos: number;
  mrrCanceladoCents: number;
  mrrInicioCents: number;
  mrrFimCents: number;
  arrCents: number;
  /** MRR cancelado / MRR do início do mês. null sem base para dividir. */
  churn: number | null;
  /** Investimento / clientes novos. null sem cliente novo. */
  cacCents: number | null;
  /** Investimento / leads. */
  custoPorLeadCents: number | null;
  /** MRR novo / clientes mensais novos. */
  ticketMrrCents: number | null;
  conversaoVisitanteLead: number | null;
  conversaoLeadSql: number | null;
  conversaoSqlCliente: number | null;
  conversaoTotal: number | null;
};

export type TotalDaJanela = {
  visitantes: number;
  investimentoCents: number;
  leads: number;
  sqls: number;
  clientes: number;
  novoMrrCents: number;
  mrrCanceladoCents: number;
  mrrFimCents: number;
  arrCents: number;
  /** Churn mensal médio: MRR cancelado total / soma dos MRR de início. */
  churnMedio: number | null;
  cacCents: number | null;
  ticketMrrCents: number | null;
  /** Quanto cada cliente deve render até cancelar: ticket / churn mensal. */
  ltvCents: number | null;
  /** LTV / CAC. Acima de 3 é o piso saudável usual em SaaS. */
  ltvSobreCac: number | null;
  /** Meses para o cliente pagar o próprio CAC: CAC / ticket. */
  paybackMeses: number | null;
  conversaoVisitanteLead: number | null;
  conversaoLeadSql: number | null;
  conversaoSqlCliente: number | null;
  conversaoTotal: number | null;
};

/** "2026-10" de uma data, no horário de Brasília. */
export function chaveDoMes(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3_600_000);
  return `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Os últimos `n` meses até `ate` inclusive, do mais antigo ao mais novo. */
export function ultimosMeses(ate: string, n: number): string[] {
  const [ano, mes] = ate.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const razao = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function calcularSaas(args: {
  /** Os meses a mostrar, em ordem. */
  meses: string[];
  informados: MesInformado[];
  negociacoes: NegociacaoIn[];
  eventos: EventoIn[];
  /** A etapa que marca "qualificado" (SQL). Sem ela, SQL fica em zero. */
  etapaSqlId: string | null;
}): { porMes: LinhaDoMes[]; total: TotalDaJanela } {
  const { meses, negociacoes, eventos, etapaSqlId } = args;
  const infoDe = new Map(args.informados.map((i) => [i.mes, i]));

  // Negociações que passaram pela etapa de qualificação, pelo histórico.
  const passouPelaSql = new Set<string>();
  if (etapaSqlId) {
    for (const e of eventos) {
      if ((e.tipo === "CRIADA" || e.tipo === "ETAPA") && e.paraStageId === etapaSqlId) passouPelaSql.add(e.negociacaoId);
    }
    // Rede de segurança, igual à do funil: sem evento, vale a etapa atual.
    for (const n of negociacoes) if (n.stageId === etapaSqlId) passouPelaSql.add(n.id);
  }

  // Ponto de partida: o último MRR inicial informado em mês ANTERIOR à janela
  // vale para o primeiro mês dela.
  const primeiro = meses[0];
  let mrrCorrente = 0;
  const anteriores = args.informados
    .filter((i) => i.mrrInicialCents !== null && i.mes < primeiro)
    .sort((a, b) => a.mes.localeCompare(b.mes));
  if (anteriores.length) mrrCorrente = anteriores[anteriores.length - 1].mrrInicialCents!;

  const porMes: LinhaDoMes[] = meses.map((mes) => {
    const info = infoDe.get(mes);
    // Um valor informado para ESTE mês redefine o ponto de partida.
    if (info && info.mrrInicialCents !== null) mrrCorrente = info.mrrInicialCents;

    const criadas = negociacoes.filter((n) => chaveDoMes(n.createdAt) === mes);
    const ganhasNoMes = negociacoes.filter((n) => n.status === "GANHA" && n.fechadaEm && chaveDoMes(n.fechadaEm) === mes);
    const mensais = ganhasNoMes.filter((n) => n.recorrencia === "MENSAL");

    const visitantes = info?.visitantes ?? 0;
    const investimentoCents = info?.investimentoCents ?? 0;
    const leads = criadas.length;
    const sqls = criadas.filter((n) => passouPelaSql.has(n.id)).length;
    const clientes = ganhasNoMes.length;
    const novoMrrCents = mensais.reduce((s, n) => s + n.valorCents, 0);
    const mrrCanceladoCents = info?.mrrCanceladoCents ?? 0;

    const mrrInicioCents = mrrCorrente;
    const mrrFimCents = Math.max(0, mrrInicioCents + novoMrrCents - mrrCanceladoCents);
    mrrCorrente = mrrFimCents;

    return {
      mes,
      visitantes,
      investimentoCents,
      leads,
      sqls,
      clientes,
      clientesMensais: mensais.length,
      novoMrrCents,
      cancelamentos: info?.cancelamentos ?? 0,
      mrrCanceladoCents,
      mrrInicioCents,
      mrrFimCents,
      arrCents: mrrFimCents * 12,
      churn: razao(mrrCanceladoCents, mrrInicioCents),
      cacCents: clientes > 0 ? Math.round(investimentoCents / clientes) : null,
      custoPorLeadCents: leads > 0 ? Math.round(investimentoCents / leads) : null,
      ticketMrrCents: mensais.length > 0 ? Math.round(novoMrrCents / mensais.length) : null,
      conversaoVisitanteLead: razao(leads, visitantes),
      conversaoLeadSql: razao(sqls, leads),
      conversaoSqlCliente: razao(clientes, sqls),
      conversaoTotal: razao(clientes, visitantes),
    };
  });

  const soma = (f: (l: LinhaDoMes) => number) => porMes.reduce((s, l) => s + f(l), 0);
  const visitantes = soma((l) => l.visitantes);
  const investimentoCents = soma((l) => l.investimentoCents);
  const leads = soma((l) => l.leads);
  const sqls = soma((l) => l.sqls);
  const clientes = soma((l) => l.clientes);
  const clientesMensais = soma((l) => l.clientesMensais);
  const novoMrrCents = soma((l) => l.novoMrrCents);
  const mrrCanceladoCents = soma((l) => l.mrrCanceladoCents);
  const mrrFimCents = porMes.length ? porMes[porMes.length - 1].mrrFimCents : 0;

  // Churn médio sobre os meses que TÊM base: um mês de MRR zero não pode puxar
  // a média para baixo contando como "0% de cancelamento".
  const comBase = porMes.filter((l) => l.mrrInicioCents > 0);
  const churnMedio = comBase.length
    ? razao(
        comBase.reduce((s, l) => s + l.mrrCanceladoCents, 0),
        comBase.reduce((s, l) => s + l.mrrInicioCents, 0)
      )
    : null;

  const cacCents = clientes > 0 ? Math.round(investimentoCents / clientes) : null;
  const ticketMrrCents = clientesMensais > 0 ? Math.round(novoMrrCents / clientesMensais) : null;
  // Churn zero (ou desconhecido) daria LTV infinito — melhor dizer "sem dado".
  const ltvCents = ticketMrrCents !== null && churnMedio !== null && churnMedio > 0 ? Math.round(ticketMrrCents / churnMedio) : null;

  return {
    porMes,
    total: {
      visitantes,
      investimentoCents,
      leads,
      sqls,
      clientes,
      novoMrrCents,
      mrrCanceladoCents,
      mrrFimCents,
      arrCents: mrrFimCents * 12,
      churnMedio,
      cacCents,
      ticketMrrCents,
      ltvCents,
      ltvSobreCac: ltvCents !== null && cacCents !== null && cacCents > 0 ? ltvCents / cacCents : null,
      paybackMeses: cacCents !== null && ticketMrrCents !== null && ticketMrrCents > 0 ? cacCents / ticketMrrCents : null,
      conversaoVisitanteLead: razao(leads, visitantes),
      conversaoLeadSql: razao(sqls, leads),
      conversaoSqlCliente: razao(clientes, sqls),
      conversaoTotal: razao(clientes, visitantes),
    },
  };
}
