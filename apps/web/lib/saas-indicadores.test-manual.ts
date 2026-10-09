// Indicadores de SaaS: funil de ponta a ponta, MRR acumulado, churn, CAC, LTV.
// Puro, sem banco. Dados fictícios.
// Rodar com: npx tsx apps/web/lib/saas-indicadores.test-manual.ts
import { calcularSaas, chaveDoMes, ultimosMeses, type MesInformado } from "./saas-indicadores";
import type { EventoIn, NegociacaoIn } from "./funil-indicadores";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

let seq = 0;
function neg(p: Partial<NegociacaoIn> = {}): NegociacaoIn {
  seq++;
  return {
    id: `n${seq}`,
    funilId: "f1",
    stageId: "lead",
    status: "ABERTA",
    valorCents: 0,
    recorrencia: "UNICA",
    responsavelId: null,
    origem: null,
    motivoPerdaId: null,
    previsaoFechamento: null,
    etapaDesde: new Date("2026-09-01T12:00:00Z"),
    createdAt: new Date("2026-09-10T12:00:00Z"),
    fechadaEm: null,
    ...p,
  };
}

const info = (mes: string, p: Partial<MesInformado> = {}): MesInformado => ({
  mes,
  visitantes: 0,
  investimentoCents: 0,
  cancelamentos: 0,
  mrrCanceladoCents: 0,
  mrrInicialCents: null,
  ...p,
});

// ------------------------------------------------------------- calendário
checa("22h de 30/09 em Brasília ainda é setembro", chaveDoMes(new Date("2026-10-01T01:00:00Z")), "2026-09");
checa("03h UTC do dia 1º já é outubro em Brasília", chaveDoMes(new Date("2026-10-01T03:00:00Z")), "2026-10");
checa("ultimosMeses cruza o ano", ultimosMeses("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);

// ----------------------------------------------------------- funil do mês
{
  const negs = [
    neg({ id: "a", stageId: "sql" }), // criada em set, está na SQL
    neg({ id: "b", stageId: "lead" }), // criada em set, nunca passou da SQL
    neg({ id: "c", stageId: "lead" }), // criada em set, passou pela SQL e voltou
    neg({
      id: "d",
      stageId: "sql",
      status: "GANHA",
      valorCents: 500_00,
      recorrencia: "MENSAL",
      fechadaEm: new Date("2026-09-20T12:00:00Z"),
    }),
  ];
  const eventos: EventoIn[] = [
    { negociacaoId: "c", tipo: "CRIADA", paraStageId: "lead", em: new Date("2026-09-10T12:00:00Z") },
    { negociacaoId: "c", tipo: "ETAPA", paraStageId: "sql", em: new Date("2026-09-11T12:00:00Z") },
    { negociacaoId: "c", tipo: "ETAPA", paraStageId: "lead", em: new Date("2026-09-12T12:00:00Z") },
  ];
  const r = calcularSaas({
    meses: ["2026-09"],
    informados: [info("2026-09", { visitantes: 1000, investimentoCents: 2000_00 })],
    negociacoes: negs,
    eventos,
    etapaSqlId: "sql",
  });
  const m = r.porMes[0];
  checa("leads = negociações criadas no mês", m.leads, 4);
  checa("SQLs: a que voltou conta (passou pelo histórico), a que nunca passou não", m.sqls, 3);
  checa("clientes = ganhas fechadas no mês", m.clientes, 1);
  checa("novo MRR = ganhas mensais", m.novoMrrCents, 500_00);
  checa("CAC = investimento / clientes", m.cacCents, 2000_00);
  checa("custo por lead", m.custoPorLeadCents, 500_00);
  checa("visitante → lead", m.conversaoVisitanteLead, 4 / 1000);
  checa("lead → SQL", m.conversaoLeadSql, 3 / 4);
  checa("SQL → cliente", m.conversaoSqlCliente, 1 / 3);
  checa("conversão total = clientes / visitantes", m.conversaoTotal, 1 / 1000);
}

// ------------------------------------------------- venda única não é MRR
{
  const r = calcularSaas({
    meses: ["2026-09"],
    informados: [],
    negociacoes: [
      neg({ status: "GANHA", valorCents: 3000_00, recorrencia: "UNICA", fechadaEm: new Date("2026-09-05T12:00:00Z") }),
    ],
    eventos: [],
    etapaSqlId: null,
  });
  checa("venda única conta como cliente", r.porMes[0].clientes, 1);
  checa("mas não entra no MRR", r.porMes[0].novoMrrCents, 0);
  checa("ticket de MRR sem cliente mensal é nulo", r.porMes[0].ticketMrrCents, null);
  checa("sem etapa de SQL, SQL fica em zero", r.porMes[0].sqls, 0);
}

// ----------------------------------------------- venda fechada na virada
{
  const r = calcularSaas({
    meses: ["2026-09", "2026-10"],
    informados: [],
    negociacoes: [
      neg({
        status: "GANHA",
        valorCents: 100_00,
        recorrencia: "MENSAL",
        // 22h30 de 30/09 em Brasília = 01h30 de 01/10 em UTC.
        fechadaEm: new Date("2026-10-01T01:30:00Z"),
      }),
    ],
    eventos: [],
    etapaSqlId: null,
  });
  checa("venda das 22h30 do dia 30 fica em setembro", [r.porMes[0].clientes, r.porMes[1].clientes], [1, 0]);
}

// -------------------------------------------------------------- MRR acumulado
{
  const ganha = (valor: number, fechada: string) =>
    neg({ status: "GANHA", valorCents: valor, recorrencia: "MENSAL", fechadaEm: new Date(fechada) });
  const r = calcularSaas({
    meses: ["2026-08", "2026-09", "2026-10"],
    informados: [
      info("2026-08", { mrrInicialCents: 1000_00 }),
      info("2026-09", { mrrCanceladoCents: 100_00, cancelamentos: 1 }),
    ],
    negociacoes: [ganha(200_00, "2026-08-15T12:00:00Z"), ganha(300_00, "2026-10-15T12:00:00Z")],
    eventos: [],
    etapaSqlId: null,
  });
  checa("agosto: 1000 + 200", [r.porMes[0].mrrInicioCents, r.porMes[0].mrrFimCents], [1000_00, 1200_00]);
  checa("setembro: início = fim de agosto, menos o cancelado", [r.porMes[1].mrrInicioCents, r.porMes[1].mrrFimCents], [1200_00, 1100_00]);
  checa("outubro: 1100 + 300", r.porMes[2].mrrFimCents, 1400_00);
  checa("ARR = 12 × MRR", r.total.arrCents, 1400_00 * 12);
  checa("churn de setembro = cancelado / MRR do início", r.porMes[1].churn, 100_00 / 1200_00);
  checa("churn sem cancelamento é zero, não nulo", r.porMes[2].churn, 0);
}

// ---------------------------------- ponto de partida informado antes da janela
{
  const r = calcularSaas({
    meses: ["2026-10"],
    informados: [info("2026-07", { mrrInicialCents: 800_00 })],
    negociacoes: [],
    eventos: [],
    etapaSqlId: null,
  });
  checa("o último MRR inicial anterior à janela vale para o primeiro mês", r.porMes[0].mrrInicioCents, 800_00);
}

// ------------------------------------------------ mês sem base não tem churn
{
  const r = calcularSaas({ meses: ["2026-10"], informados: [info("2026-10", { mrrCanceladoCents: 50_00 })], negociacoes: [], eventos: [], etapaSqlId: null });
  checa("sem MRR de início o churn é nulo (não divide por zero)", r.porMes[0].churn, null);
  checa("MRR nunca fica negativo", r.porMes[0].mrrFimCents, 0);
}

// ------------------------------------------------------------ LTV, CAC, payback
{
  const ganha = (valor: number, fechada: string) =>
    neg({ status: "GANHA", valorCents: valor, recorrencia: "MENSAL", fechadaEm: new Date(fechada) });
  const r = calcularSaas({
    meses: ["2026-09", "2026-10"],
    informados: [
      info("2026-09", { mrrInicialCents: 1000_00, investimentoCents: 1000_00 }),
      info("2026-10", { investimentoCents: 1000_00, mrrCanceladoCents: 50_00 }),
    ],
    negociacoes: [ganha(200_00, "2026-09-10T12:00:00Z"), ganha(200_00, "2026-10-10T12:00:00Z")],
    eventos: [],
    etapaSqlId: null,
  });
  // Setembro: início 1000, fim 1200 (sem cancelamento). Outubro: início 1200, cancela 50.
  checa("churn médio = cancelado total / soma dos MRR de início", r.total.churnMedio, 50_00 / (1000_00 + 1200_00));
  checa("CAC da janela = investimento total / clientes", r.total.cacCents, 1000_00);
  checa("ticket = MRR novo / clientes mensais", r.total.ticketMrrCents, 200_00);
  checa("LTV = ticket / churn", r.total.ltvCents, Math.round(200_00 / (50_00 / 2200_00)));
  checa("LTV / CAC", r.total.ltvSobreCac, Math.round(200_00 / (50_00 / 2200_00)) / 1000_00);
  checa("payback = CAC / ticket, em meses", r.total.paybackMeses, 5);
}

// --------------------------------------------- churn zero: LTV não é infinito
{
  const r = calcularSaas({
    meses: ["2026-10"],
    informados: [info("2026-10", { mrrInicialCents: 1000_00, investimentoCents: 500_00 })],
    negociacoes: [
      neg({ status: "GANHA", valorCents: 100_00, recorrencia: "MENSAL", fechadaEm: new Date("2026-10-10T12:00:00Z") }),
    ],
    eventos: [],
    etapaSqlId: null,
  });
  checa("sem cancelamento o LTV é 'sem dado', não infinito", r.total.ltvCents, null);
  checa("e o LTV/CAC também", r.total.ltvSobreCac, null);
  checa("CAC continua calculável", r.total.cacCents, 500_00);
}

// ------------------------------------------------------------ sem nada informado
{
  const r = calcularSaas({ meses: ["2026-10"], informados: [], negociacoes: [], eventos: [], etapaSqlId: null });
  checa("sem visitantes a conversão é nula, não zero nem NaN", r.porMes[0].conversaoTotal, null);
  checa("janela vazia", [r.total.leads, r.total.clientes, r.total.cacCents], [0, 0, null]);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
