// Linha de crédito: limite, usado, disponível e excedente.
// Rodar com: npx tsx apps/web/lib/credito.test-manual.ts
import assert from "node:assert/strict";
import { excedenteDoCredito, situacaoDoCredito, valorQueUsaCredito } from "./credito";

// Sem limite definido: null, e quem chama aplica a regra antiga.
assert.equal(situacaoDoCredito(null, { saldoCents: 5000, vencidoCents: 0 }), null);
assert.equal(situacaoDoCredito(undefined, null), null);

// Sem dívida: tudo disponível.
assert.deepEqual(situacaoDoCredito(100000, null), {
  limiteCents: 100000,
  usadoCents: 0,
  disponivelCents: 100000,
  vencidoCents: 0,
  percentualUsado: 0,
});

// Com dívida: o usado vem da pendência.
const c = situacaoDoCredito(100000, { saldoCents: 40000, vencidoCents: 10000 })!;
assert.equal(c.usadoCents, 40000);
assert.equal(c.disponivelCents, 60000);
assert.equal(c.vencidoCents, 10000);
assert.equal(c.percentualUsado, 40);

// Devendo mais que o limite: disponível não fica negativo, barra para em 100.
const estourado = situacaoDoCredito(100000, { saldoCents: 130000, vencidoCents: 0 })!;
assert.equal(estourado.disponivelCents, 0);
assert.equal(estourado.percentualUsado, 100);

// Limite zero é um limite (cliente sem crédito), não "sem limite".
const zero = situacaoDoCredito(0, { saldoCents: 0, vencidoCents: 0 })!;
assert.equal(zero.disponivelCents, 0);
assert.equal(zero.percentualUsado, 0);
assert.equal(excedenteDoCredito(zero, 5000), 5000, "limite zero: toda venda a prazo passa");

// Excedente da nova venda.
assert.equal(excedenteDoCredito(c, 60000), 0, "cabe exatamente");
assert.equal(excedenteDoCredito(c, 60001), 1, "passa por 1 centavo");
assert.equal(excedenteDoCredito(c, 90000), 30000);

// A entrada recebida na hora não consome crédito; a que ainda vai entrar, sim.
assert.equal(valorQueUsaCredito(100000, 30000), 70000);
assert.equal(valorQueUsaCredito(100000, 0), 100000);
assert.equal(valorQueUsaCredito(100000, 150000), 0, "entrada maior que o total");

console.log("credito: ok");
