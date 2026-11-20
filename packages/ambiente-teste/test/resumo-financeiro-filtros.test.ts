import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { filtrosDoResumo } from "../../../apps/web/lib/filtros-do-resumo";

/**
 * Os cartões do A receber e do A pagar (Vencido, Vence hoje, A vencer, Em aberto) seguem os filtros da lista.
 * Antes mostravam o total da empresa inteira ao lado de uma lista filtrada (Dilon Tech, 12/11: lista de
 * novembro com R$ 1.294 e cartão "A vencer" com R$ 12.940, as dez parcelas de cada assinatura).
 */

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("cartões do financeiro seguem os filtros", () => {
  test("período de vencimento, cliente, tipo e categoria passam para os cartões", () => {
    const r = filtrosDoResumo({
      desde: dia("2026-11-01"),
      ate: dia("2026-11-30"),
      tipoData: "vencimento" as const,
      cliente: "Carlos",
      tipo: "MENSAL",
      categoria: "cat-1",
    });
    assert.deepEqual(r.desde, dia("2026-11-01"));
    assert.deepEqual(r.ate, dia("2026-11-30"));
    assert.equal(r.cliente, "Carlos");
    assert.equal(r.tipo, "MENSAL");
    assert.equal(r.categoria, "cat-1");
  });

  test("os cartões são sempre das parcelas em aberto, por vencimento", () => {
    const r = filtrosDoResumo({ tipoData: "vencimento" as const });
    assert.deepEqual(r.status, ["PENDENTE"]);
    assert.equal(r.tipoData, "vencimento");
  });

  test("período por data de pagamento não entra (parcela em aberto não tem pagamento; zeraria os cartões)", () => {
    const r = filtrosDoResumo({ desde: dia("2026-11-01"), ate: dia("2026-11-30"), tipoData: "pagamento" as const, cliente: "Carlos" });
    assert.equal(r.desde, undefined);
    assert.equal(r.ate, undefined);
    assert.equal(r.tipoData, "vencimento");
    assert.equal(r.cliente, "Carlos");
  });

  test("sem filtro nenhum: todas as parcelas em aberto, como antes", () => {
    const r = filtrosDoResumo({});
    assert.equal(r.desde, undefined);
    assert.equal(r.ate, undefined);
    assert.deepEqual(r.status, ["PENDENTE"]);
  });

  test("o fornecedor do A pagar também passa", () => {
    const r = filtrosDoResumo({ tipoData: "vencimento" as const, fornecedor: "Loja X", forma: "PIX" });
    assert.equal(r.fornecedor, "Loja X");
    assert.equal(r.forma, "PIX");
  });
});
