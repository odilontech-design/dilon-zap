import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calcularComissao, comissaoPorConsultora } from "../../../apps/web/lib/comissao";

/** Regra pura: não toca no banco. */
describe("comissão por faixa de venda", () => {
  test("abaixo de 12 mil não há comissão e mostra quanto falta", () => {
    const r = calcularComissao(11_999_99);
    assert.equal(r.comissaoCents, 0);
    assert.equal(r.faixa, null);
    assert.equal(r.proxima?.faltaCents, 1);
  });

  test("cada degrau vale a partir do valor exato", () => {
    assert.equal(calcularComissao(12_000_00).taxaBp, 130);
    assert.equal(calcularComissao(16_999_99).taxaBp, 130);
    assert.equal(calcularComissao(17_000_00).taxaBp, 150);
    assert.equal(calcularComissao(20_000_00).taxaBp, 180);
    assert.equal(calcularComissao(25_000_00).taxaBp, 200);
  });

  test("a faixa atingida vale sobre o total inteiro (18.594,09 a 1,5%)", () => {
    const r = calcularComissao(18_594_09);
    assert.equal(r.taxaBp, 150);
    assert.equal(r.comissaoCents, 278_91); // 18.594,09 × 1,5% = 278,9113…
    assert.equal(r.proxima?.faltaCents, 1_405_91);
  });

  test("na última faixa não há próxima", () => {
    const r = calcularComissao(30_000_00);
    assert.equal(r.comissaoCents, 600_00);
    assert.equal(r.proxima, null);
  });

  test("só pedido fechado no período conta, e cada consultora tem a própria faixa", () => {
    const d = (s: string) => new Date(s);
    const linhas = comissaoPorConsultora(
      [
        { totalCents: 13_000_00, status: "FECHADO", createdById: "a", fechadoEm: d("2026-11-03") },
        { totalCents: 5_000_00, status: "CANCELADO", createdById: "a", fechadoEm: d("2026-11-03") },
        { totalCents: 4_000_00, status: "RASCUNHO", createdById: "a", fechadoEm: null },
        { totalCents: 9_000_00, status: "FECHADO", createdById: "a", fechadoEm: d("2026-10-30") },
        { totalCents: 3_000_00, status: "FECHADO", createdById: "b", fechadoEm: d("2026-11-04") },
        { totalCents: 1_000_00, status: "FECHADO", createdById: null, fechadoEm: d("2026-11-04") },
      ],
      { desde: d("2026-11-01"), ate: d("2026-11-30T23:59:59") }
    );
    assert.deepEqual(
      linhas.map((l) => [l.usuarioId, l.pedidos, l.vendidoCents, l.comissaoCents]),
      [
        ["a", 1, 13_000_00, 169_00],
        ["b", 1, 3_000_00, 0],
        [null, 1, 1_000_00, 0],
      ]
    );
  });
});
