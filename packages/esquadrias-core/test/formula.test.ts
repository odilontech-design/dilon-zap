import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarFormula, validarFormula, ErroDeFormula } from "../src/formula";

test("respeita precedência e parênteses", () => {
  assert.equal(avaliarFormula("2 + 3 * 4", {}), 14);
  assert.equal(avaliarFormula("(2 + 3) * 4", {}), 20);
  assert.equal(avaliarFormula("2 ^ 3 ^ 2", {}), 512); // associativo à direita
  assert.equal(avaliarFormula("-3 + 10", {}), 7);
});

test("resolve variáveis da esquadria", () => {
  assert.equal(avaliarFormula("L - 2 * folga", { L: 1200, folga: 15 }), 1170);
  assert.equal(avaliarFormula("largura + altura", { L: 1200, H: 1000, largura: 1200, altura: 1000 }), 2200);
});

test("aceita vírgula decimal, como o teclado brasileiro", () => {
  assert.equal(avaliarFormula("L * 0,5", { L: 1000 }), 500);
});

test("funções em português", () => {
  assert.equal(avaliarFormula("teto(L / 600)", { L: 1250 }), 3);
  assert.equal(avaliarFormula("piso(L / 600)", { L: 1250 }), 2);
  assert.equal(avaliarFormula("arred(L / 3, 2)", { L: 1000 }), 333.33);
  assert.equal(avaliarFormula("min(L, H)", { L: 1200, H: 900 }), 900);
  assert.equal(avaliarFormula("max(L, H, 2000)", { L: 1200, H: 900 }), 2000);
});

test("se() escolhe o ramo pela comparação", () => {
  // Regra real: acima de 1,80m a folha leva reforço, e o corte muda.
  assert.equal(avaliarFormula("se(H > 1800, 2, 1)", { H: 2000 }), 2);
  assert.equal(avaliarFormula("se(H > 1800, 2, 1)", { H: 1500 }), 1);
  assert.equal(avaliarFormula("se(L == 1000, 5, 9)", { L: 1000 }), 5);
});

test("não executa nada do host — expressão só enxerga o escopo", () => {
  // A fórmula vem do banco, escrita por um cliente do SaaS. Se um dia isto
  // virar `eval`, este teste é o que quebra.
  assert.throws(() => avaliarFormula("process", { L: 1 }), ErroDeFormula);
  assert.throws(() => avaliarFormula("globalThis.process.env.DATABASE_URL", { L: 1 }), ErroDeFormula);
  assert.throws(() => avaliarFormula("constructor", { L: 1 }), ErroDeFormula);
  assert.throws(() => avaliarFormula("toString()", { L: 1 }), ErroDeFormula);
});

test("erros são específicos o bastante pra virar mensagem de tela", () => {
  assert.throws(() => avaliarFormula("L + ", { L: 1 }), /expressão incompleta/);
  assert.throws(() => avaliarFormula("L / 0", { L: 1 }), /divisão por zero/);
  assert.throws(() => avaliarFormula("bobagem(L)", { L: 1 }), /função desconhecida/);
  assert.throws(() => avaliarFormula("min()", { L: 1 }), /argumento/);
  assert.throws(() => avaliarFormula("X + 1", { L: 1 }), /variável não definida/);
});

test("validarFormula não precisa de medidas reais", () => {
  assert.deepEqual(validarFormula("L - 2 * folga", ["L", "folga"]), { ok: true });
  const r = validarFormula("L - 2 * folgaa", ["L", "folga"]);
  assert.equal(r.ok, false);
});
