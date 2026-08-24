import { test } from "node:test";
import assert from "node:assert/strict";
import { expandirTipologia } from "../src/tipologia";
import { planejarCorte, entradasDeCorte } from "../src/corte";
import { GRADE_FERRO } from "./fixtures";

/**
 * Ferro no mesmo motor do alumínio.
 *
 * O que a serralheria faz na mão — contar quantas barras cabem no vão e
 * quanto de eletrodo e tinta aquilo vai comer — é o que estes testes fixam.
 */

test("o número de barras da grade sai do vão, não de uma constante", () => {
  const barras = (L: number) =>
    expandirTipologia(GRADE_FERRO, { larguraMm: L, alturaMm: 1200, quantidade: 1 }).pecas.find((p) => p.templateId === "g3")!.quantidade;

  // teto((L - 10) / 110) - 1 espaços livres de no máximo 110mm entre barras.
  assert.equal(barras(1000), 8);
  assert.equal(barras(1500), 13);
  assert.equal(barras(2400), 21);
});

test("espaçamento ajustado no item muda a grade sem mexer na tipologia", () => {
  const apertada = expandirTipologia(GRADE_FERRO, {
    larguraMm: 1500,
    alturaMm: 1200,
    quantidade: 1,
    parametros: { espacamento: 80 },
  });
  assert.equal(apertada.pecas.find((p) => p.templateId === "g3")!.quantidade, 18);
});

test("perfil de ferro custa por peso, igual ao alumínio", () => {
  const e = expandirTipologia(GRADE_FERRO, { larguraMm: 1000, alturaMm: 1200, quantidade: 1 });
  const verticais = e.pecas.find((p) => p.templateId === "g3")!;

  // 8 barras de 1130mm a 0,71 kg/m = 6,4184 kg; a R$ 10,50/kg = R$ 67,39
  assert.equal(verticais.comprimentoMm, 1130);
  assert.equal(Number(verticais.pesoTotalKg.toFixed(4)), 6.4184);
  assert.equal(verticais.custoCentavos, 6739);
});

test("consumível a granel cobra a fração; peça continua arredondando pra cima", () => {
  const e = expandirTipologia(GRADE_FERRO, { larguraMm: 1000, alturaMm: 1200, quantidade: 1 });

  // 0,04 kg x (9 + 3) = 0,48 kg de eletrodo — não 1 kg.
  const eletrodo = e.ferragens.find((f) => f.templateId === "gf2")!;
  assert.equal(eletrodo.quantidade, 0.48);
  assert.equal(eletrodo.custoCentavos, 1536);

  // 1,2 m² x 2 faces = 2,4 m² de tinta — não 3 m².
  const tinta = e.ferragens.find((f) => f.templateId === "gf3")!;
  assert.equal(tinta.quantidade, 2.4);
  assert.equal(tinta.custoCentavos, 2640);

  // Chumbador é peça: continua inteiro.
  const chumbador = e.ferragens.find((f) => f.templateId === "gf1")!;
  assert.equal(chumbador.quantidade, 8);
  assert.equal(chumbador.fracionavel, false);
});

test("granel também escala com a quantidade do item, sem arredondar no meio", () => {
  const tres = expandirTipologia(GRADE_FERRO, { larguraMm: 1000, alturaMm: 1200, quantidade: 3 });
  assert.equal(tres.ferragens.find((f) => f.templateId === "gf2")!.quantidade, 1.44);
  assert.equal(tres.ferragens.find((f) => f.templateId === "gf3")!.quantidade, 7.2);
});

test("plano de corte funciona em barra de ferro como em barra de alumínio", () => {
  const e = expandirTipologia(GRADE_FERRO, { larguraMm: 1000, alturaMm: 1200, quantidade: 1 });
  const plano = planejarCorte(entradasDeCorte(e.pecas), { espessuraSerraMm: 2, sobraMinimaAproveitavelMm: 500 });

  const met20 = plano.perfis.find((p) => p.perfilCodigo === "MET-20x20")!;
  // 8 peças de 1130mm + serra: 5 por barra de 6000mm, então 2 barras.
  assert.equal(met20.totalPecas, 8);
  assert.equal(met20.totalBarras, 2);
  assert.ok(plano.custoBarrasCentavos > 0);
});
