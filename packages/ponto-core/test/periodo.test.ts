import { test } from "node:test";
import assert from "node:assert/strict";
import { apurarDia } from "../src/apuracao";
import { extratoBanco } from "../src/banco";
import { fecharPeriodo, type DiaApurado } from "../src/periodo";
import { REGRAS_CLT_PADRAO } from "../src/regras";
import { bat, COMERCIAL } from "./fixtures";

const R = REGRAS_CLT_PADRAO;

/**
 * Uma semana com um pouco de tudo:
 * seg cumprida, ter 1h extra, qua falta, qui marcação ímpar, dom 4h trabalhadas.
 */
function semana(): DiaApurado[] {
  const util = (data: string, m: string): DiaApurado => ({
    data,
    apuracao: apurarDia({ tipoDia: "UTIL", previsto: COMERCIAL, marcacoes: m ? bat(m) : [] }, R),
  });
  return [
    util("2026-11-09", "08:00 12:00 13:00 17:00"),
    util("2026-11-10", "08:00 12:00 13:00 18:00"),
    util("2026-11-11", ""),
    util("2026-11-12", "08:00 12:00 13:00"),
    {
      data: "2026-11-15",
      apuracao: apurarDia({ tipoDia: "DESCANSO", previsto: [], marcacoes: bat("08:00 12:00") }, R),
    },
  ];
}

test("sem banco de horas: extra é paga por percentual e débito é descontado", () => {
  const f = fecharPeriodo(semana(), { bancoDeHoras: null });
  assert.deepEqual(f.extrasAPagar, [
    { percentualBp: 5000, minutos: 60 },
    { percentualBp: 10000, minutos: 240 },
  ]);
  // falta (480) + quinta incompleta (240 trabalhados de 480)
  assert.equal(f.debitoADescontarMin, 720);
  assert.equal(f.faltas, 1);
  assert.deepEqual(f.diasIncompletos, ["2026-11-12"]);
  assert.deepEqual(f.lancamentosBanco, []);
});

test("com banco de horas: dia útil vai para o banco, domingo continua pago", () => {
  const f = fecharPeriodo(semana(), { bancoDeHoras: { incluirDiasDeDescanso: false } });
  assert.deepEqual(f.extrasAPagar, [{ percentualBp: 10000, minutos: 240 }]);
  assert.equal(f.debitoADescontarMin, 0);
  assert.deepEqual(
    f.lancamentosBanco.map((l) => [l.data, l.minutos]),
    [
      ["2026-11-10", 60],
      ["2026-11-11", -480],
      ["2026-11-12", -240],
    ],
  );
});

test("com banco incluindo descanso: nada é pago, tudo vira lançamento", () => {
  const f = fecharPeriodo(semana(), { bancoDeHoras: { incluirDiasDeDescanso: true } });
  assert.deepEqual(f.extrasAPagar, []);
  assert.equal(f.lancamentosBanco.at(-1)?.minutos, 240);
});

test("o movimento do fechamento alimenta o extrato do banco", () => {
  const f = fecharPeriodo(semana(), { bancoDeHoras: { incluirDiasDeDescanso: false } });
  const e = extratoBanco(f.lancamentosBanco, "2026-11-30", { validadeDias: 180 });
  assert.equal(e.saldoMin, 60 - 480 - 240);
});

test("a ordem dos dias na entrada não muda o resultado", () => {
  const normal = fecharPeriodo(semana(), { bancoDeHoras: { incluirDiasDeDescanso: false } });
  const invertida = fecharPeriodo(semana().reverse(), { bancoDeHoras: { incluirDiasDeDescanso: false } });
  assert.deepEqual(invertida, normal);
});

test("totais do período", () => {
  const f = fecharPeriodo(semana(), { bancoDeHoras: null });
  assert.equal(f.dias, 5);
  assert.equal(f.previstoMin, 4 * 480);
  assert.equal(f.trabalhadoMin, 480 + 540 + 0 + 240 + 240);
});
