// Histórico das OS: filtro, resumo, séries e rankings.
// Rodar com: npx tsx apps/web/lib/otica-historico.test-manual.ts
import assert from "node:assert/strict";
import {
  agruparPorPeriodo,
  dataDaOS,
  escolherGranularidade,
  fimDoDia,
  inicioDoDia,
  passaNoFiltro,
  rankingPor,
  resumirHistorico,
  SEM_FILTROS,
  type OSDoHistorico,
} from "./otica-historico";

let n = 0;
function os(p: Partial<Omit<OSDoHistorico, "entregueEm" | "canceladaEm">> & { entregueEm?: string | null; canceladaEm?: string | null }): OSDoHistorico {
  n += 1;
  return {
    id: `os${n}`,
    numero: n,
    etapa: "ENTREGUE",
    historica: false,
    entregueEm: p.entregueEm === undefined ? new Date("2026-11-10T15:00:00Z") : p.entregueEm ? new Date(p.entregueEm) : null,
    canceladaEm: p.canceladaEm ? new Date(p.canceladaEm) : null,
    previsaoEntrega: null,
    createdAt: new Date("2026-11-01T12:00:00Z"),
    valorCents: 10000,
    recebidoCents: 10000,
    saldoCents: 0,
    semLancamento: false,
    laboratorio: null,
    consultor: null,
    materialLente: null,
    ...p,
    ...(p.entregueEm !== undefined ? { entregueEm: p.entregueEm ? new Date(p.entregueEm) : null } : {}),
    ...(p.canceladaEm !== undefined ? { canceladaEm: p.canceladaEm ? new Date(p.canceladaEm) : null } : {}),
  } as OSDoHistorico;
}

// Data que posiciona a OS.
assert.equal(dataDaOS(os({ entregueEm: "2026-11-10T15:00:00Z" })).toISOString(), "2026-11-10T15:00:00.000Z");
assert.equal(
  dataDaOS(os({ etapa: "CANCELADA", entregueEm: null, canceladaEm: "2026-11-12T10:00:00Z" })).toISOString(),
  "2026-11-12T10:00:00.000Z",
  "cancelada usa a data do cancelamento"
);
assert.equal(dataDaOS(os({ entregueEm: null })).toISOString(), "2026-11-01T12:00:00.000Z", "sem nenhuma data: criação");

// Dias em horário de Brasília.
assert.equal(inicioDoDia("2026-11-01")!.toISOString(), "2026-11-01T03:00:00.000Z");
assert.equal(fimDoDia("2026-11-30")!.toISOString(), "2026-12-01T02:59:59.999Z");
assert.equal(inicioDoDia("01/11/2026"), undefined);
assert.equal(inicioDoDia(""), undefined);

// Filtro por período: o dia final inclui a noite desse dia.
const noite30 = os({ entregueEm: "2026-12-01T01:30:00Z" }); // 30/11 22h30 em Brasília
assert.ok(passaNoFiltro(noite30, { ...SEM_FILTROS, de: inicioDoDia("2026-11-01"), ate: fimDoDia("2026-11-30") }), "30/11 à noite ainda é novembro");
assert.ok(!passaNoFiltro(noite30, { ...SEM_FILTROS, de: inicioDoDia("2026-12-01") }), "e não é dezembro");

// Demais filtros.
const lab1 = os({ laboratorio: { id: "l1", nome: "Lab A" } });
assert.ok(passaNoFiltro(lab1, { ...SEM_FILTROS, laboratorioId: "l1" }));
assert.ok(!passaNoFiltro(lab1, { ...SEM_FILTROS, laboratorioId: "l2" }));
assert.ok(!passaNoFiltro(os({}), { ...SEM_FILTROS, laboratorioId: "l1" }), "sem laboratório não passa no filtro de laboratório");
assert.ok(passaNoFiltro(os({ historica: true }), { ...SEM_FILTROS, origem: "papel" }));
assert.ok(!passaNoFiltro(os({ historica: true }), { ...SEM_FILTROS, origem: "sistema" }));
assert.ok(!passaNoFiltro(os({ etapa: "CANCELADA" }), { ...SEM_FILTROS, situacao: "entregues" }));
assert.ok(passaNoFiltro(os({ saldoCents: 500, recebidoCents: 9500 }), { ...SEM_FILTROS, financeiro: "com-saldo" }));
assert.ok(!passaNoFiltro(os({}), { ...SEM_FILTROS, financeiro: "com-saldo" }));
assert.ok(passaNoFiltro(os({}), { ...SEM_FILTROS, financeiro: "quitadas" }));
assert.ok(!passaNoFiltro(os({ semLancamento: true, recebidoCents: 0 }), { ...SEM_FILTROS, financeiro: "quitadas" }), "sem lançamento não é quitada");
assert.ok(passaNoFiltro(os({ semLancamento: true, recebidoCents: 0 }), { ...SEM_FILTROS, financeiro: "sem-lancamento" }));

// Resumo: cancelada não entra no faturamento, nem no recebido.
const conjunto = [
  os({ valorCents: 20000, recebidoCents: 20000 }),
  os({ valorCents: 10000, recebidoCents: 4000, saldoCents: 6000 }),
  os({ valorCents: 0, recebidoCents: 0, semLancamento: true }),
  os({ valorCents: 5000, recebidoCents: 0, semLancamento: true }),
  os({ etapa: "CANCELADA", valorCents: 99900, recebidoCents: 0, entregueEm: null, canceladaEm: "2026-11-05T12:00:00Z" }),
];
const r = resumirHistorico(conjunto);
assert.equal(r.total, 5);
assert.equal(r.entregues, 4);
assert.equal(r.canceladas, 1);
assert.equal(r.taxaDeCancelamento, 20);
assert.equal(r.faturamentoCents, 35000, "só as entregues somam");
assert.equal(r.ticketMedioCents, Math.round(35000 / 3), "ticket só conta as entregues com valor");
assert.equal(r.recebidoCents, 24000);
assert.equal(r.saldoCents, 6000);
assert.equal(r.entreguesComSaldo, 1);
assert.equal(r.semLancamento, 1, "valor zero sem conta não é pendência de lançamento");
assert.equal(r.semLancamentoCents, 5000);
assert.equal(r.faturamentoCents, r.recebidoCents + r.saldoCents + r.semLancamentoCents, "os números fecham: faturamento = recebido + a receber + sem lançamento");
assert.equal(resumirHistorico([]).taxaDeCancelamento, null);
assert.equal(resumirHistorico([]).ticketMedioCents, 0);

// Séries.
const meses = [
  os({ entregueEm: "2026-09-10T15:00:00Z", valorCents: 100 }),
  os({ entregueEm: "2026-11-10T15:00:00Z", valorCents: 300 }),
  os({ entregueEm: "2026-11-20T15:00:00Z", valorCents: 200 }),
];
assert.equal(escolherGranularidade(meses), "mes");
const serie = agruparPorPeriodo(meses, "mes");
assert.deepEqual(
  serie.map((p) => [p.chave, p.entregues, p.faturamentoCents]),
  [["2026-09", 1, 100], ["2026-10", 0, 0], ["2026-11", 2, 500]],
  "mês sem OS aparece zerado, sem buraco"
);
assert.equal(serie[0].rotulo, "set/26");
assert.equal(agruparPorPeriodo([os({ etapa: "CANCELADA", entregueEm: null, canceladaEm: "2026-11-05T12:00:00Z" })], "mes").length, 0, "só cancelada: sem série");

const anos = [os({ entregueEm: "2015-04-09T15:00:00Z", valorCents: 167 }), os({ entregueEm: "2026-10-07T15:00:00Z", valorCents: 50 })];
assert.equal(escolherGranularidade(anos), "ano", "mais de dois anos agrupa por ano");
const serieAnos = agruparPorPeriodo(anos, "ano");
assert.equal(serieAnos.length, 12, "2015 a 2026, anos sem OS zerados");
assert.equal(serieAnos[0].rotulo, "2015");
assert.equal(serieAnos[11].faturamentoCents, 50);
// 31/12 à noite em Brasília é 01/01 em UTC: continua no ano que acaba.
assert.equal(agruparPorPeriodo([os({ entregueEm: "2027-01-01T01:00:00Z" })], "ano")[0].chave, "2026");

// Ranking.
const rank = rankingPor(
  [
    os({ valorCents: 300, laboratorio: { id: "a", nome: "Lab A" } }),
    os({ valorCents: 100, laboratorio: { id: "b", nome: "Lab B" } }),
    os({ valorCents: 900 }),
    os({ valorCents: 200, laboratorio: { id: "a", nome: "Lab A" } }),
    os({ etapa: "CANCELADA", valorCents: 5000, laboratorio: { id: "b", nome: "Lab B" } }),
  ],
  (o) => o.laboratorio?.nome ?? null
);
assert.deepEqual(rank.map((l) => [l.nome, l.entregues, l.faturamentoCents]), [["Lab A", 2, 500], ["Lab B", 1, 100], ["Não informado", 1, 900]], "não informado vai para o fim");

console.log("otica-historico: ok");
