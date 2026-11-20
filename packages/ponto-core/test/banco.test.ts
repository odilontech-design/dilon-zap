import { test } from "node:test";
import assert from "node:assert/strict";
import { extratoBanco } from "../src/banco";

const SEIS_MESES = { validadeDias: 180 };

test("crédito menos débito dá o saldo, com o vencimento de cada lote", () => {
  const e = extratoBanco(
    [
      { data: "2026-01-10", minutos: 120 },
      { data: "2026-02-01", minutos: -30 },
    ],
    "2026-02-28",
    SEIS_MESES,
  );
  assert.equal(e.saldoMin, 90);
  assert.deepEqual(e.lotes, [{ data: "2026-01-10", vence: "2026-07-09", restanteMin: 90 }]);
  assert.deepEqual(e.vencidos, []);
});

test("o crédito vale até o fim do dia do vencimento", () => {
  const e = extratoBanco([{ data: "2026-01-10", minutos: 90 }], "2026-07-09", SEIS_MESES);
  assert.equal(e.saldoMin, 90);
});

test("no dia seguinte ao vencimento, o crédito sai do banco e vira extra a pagar", () => {
  const e = extratoBanco([{ data: "2026-01-10", minutos: 90 }], "2026-07-10", SEIS_MESES);
  assert.equal(e.saldoMin, 0);
  assert.deepEqual(e.vencidos, [{ data: "2026-01-10", venceu: "2026-07-09", minutos: 90 }]);
});

test("débito consome primeiro o crédito que vence antes", () => {
  const e = extratoBanco(
    [
      { data: "2026-01-10", minutos: 60 },
      { data: "2026-02-10", minutos: 60 },
      { data: "2026-03-01", minutos: -90 },
    ],
    "2026-03-01",
    SEIS_MESES,
  );
  assert.deepEqual(
    e.lotes.map((l) => [l.data, l.restanteMin]),
    [["2026-02-10", 30]],
  );
});

test("débito sem crédito fica negativo, e o próximo crédito quita primeiro", () => {
  const e = extratoBanco(
    [
      { data: "2026-01-05", minutos: -45 },
      { data: "2026-01-20", minutos: 60 },
    ],
    "2026-01-31",
    SEIS_MESES,
  );
  assert.equal(e.saldoNegativoMin, 0);
  assert.equal(e.saldoMin, 15);
  assert.deepEqual(e.lotes, [{ data: "2026-01-20", vence: "2026-07-19", restanteMin: 15 }]);
});

test("só débito: saldo negativo", () => {
  const e = extratoBanco([{ data: "2026-01-05", minutos: -45 }], "2026-01-31", SEIS_MESES);
  assert.equal(e.saldoMin, -45);
  assert.equal(e.saldoNegativoMin, 45);
});

test("crédito vencido não compensa débito posterior", () => {
  const e = extratoBanco(
    [
      { data: "2026-01-10", minutos: 60 },
      { data: "2026-01-25", minutos: -30 },
    ],
    "2026-01-31",
    { validadeDias: 10 },
  );
  assert.deepEqual(e.vencidos, [{ data: "2026-01-10", venceu: "2026-01-20", minutos: 60 }]);
  assert.equal(e.saldoMin, -30);
});

test("lançamentos depois da data de referência são ignorados", () => {
  const e = extratoBanco(
    [
      { data: "2026-01-10", minutos: 60 },
      { data: "2026-02-10", minutos: -60 },
    ],
    "2026-01-31",
    SEIS_MESES,
  );
  assert.equal(e.saldoMin, 60);
});
