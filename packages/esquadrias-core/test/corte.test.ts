import { test } from "node:test";
import assert from "node:assert/strict";
import { planejarCorte, entradasDeCorte, OPCOES_CORTE_PADRAO, type EntradaCorte } from "../src/corte";
import { expandirTipologia } from "../src/tipologia";
import { JANELA_2_FOLHAS } from "./fixtures";

function entrada(comprimentos: number[], barraMm = 6000): EntradaCorte {
  return {
    perfilId: "p", perfilCodigo: "25.01", perfilNome: "Trilho", comprimentoBarraMm: barraMm,
    pesoPorMetro: 0.5, precoPorKgCentavos: 4500,
    pecas: comprimentos.map((c, i) => ({ perfilId: "p", descricao: `peça ${i}`, comprimentoMm: c, corte: "RETO" as const, origem: "" })),
  };
}

test("a serra cabe na conta: 3x2000mm não entram numa barra de 6000mm", () => {
  // Sem contar o disco, 3 x 2000 = 6000 e "cabe". Com 3mm de serra por corte
  // são 6009mm — e quem descobre isso na bancada já comprou barra a menos.
  const plano = planejarCorte([entrada([2000, 2000, 2000, 2000])], OPCOES_CORTE_PADRAO);
  assert.equal(plano.perfis[0].totalBarras, 2);
  assert.equal(plano.perfis[0].barras[0].pecas.length, 2);
});

test("empacota 10 peças de 1500mm em 4 barras", () => {
  const plano = planejarCorte([entrada(Array(10).fill(1500))], OPCOES_CORTE_PADRAO);
  assert.equal(plano.perfis[0].totalBarras, 4);
  assert.equal(plano.perfis[0].barras.filter((b) => b.pecas.length === 3).length, 3);
});

test("mistura tamanhos melhor que o corte ingênuo (uma barra por peça grande)", () => {
  const comprimentos = [3500, 3500, 2400, 2400, 1200, 1200, 800, 800];
  const plano = planejarCorte([entrada(comprimentos)], OPCOES_CORTE_PADRAO);
  const totalMm = comprimentos.reduce((a, b) => a + b, 0);

  // Piso teórico: 15800mm / 6000mm = 2,63 → 3 barras. A heurística tem que
  // chegar nesse piso, não em 4.
  assert.equal(plano.perfis[0].totalBarras, Math.ceil(totalMm / 6000));
  assert.ok(plano.perfis[0].aproveitamentoPercent > 85);
});

test("sobra grande é retalho reaproveitável, sobra pequena é refugo", () => {
  const plano = planejarCorte([entrada([5000])], { espessuraSerraMm: 3, sobraMinimaAproveitavelMm: 300 });
  const barra = plano.perfis[0].barras[0];
  assert.equal(barra.sobraMm, 997);
  assert.equal(barra.sobraAproveitavel, true);
  assert.equal(plano.perfis[0].sobraAproveitavelMm, 997);

  const semSobraUtil = planejarCorte([entrada([5900])], { espessuraSerraMm: 3, sobraMinimaAproveitavelMm: 300 });
  assert.equal(semSobraUtil.perfis[0].barras[0].sobraAproveitavel, false);
});

test("separa por perfil e por comprimento de barra comprado", () => {
  const plano = planejarCorte([entrada([2000, 2000], 6000), { ...entrada([2000], 3000), perfilId: "q", perfilCodigo: "25.09" }]);
  assert.equal(plano.perfis.length, 2);
  assert.equal(plano.totalBarras, 2);
});

test("expansão da tipologia alimenta o plano de corte direto", () => {
  const e = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 10 });
  const entradas = entradasDeCorte(e.pecas, (p) => p.descricao);

  // O perfil de folha aparece em duas peças diferentes (vertical e
  // horizontal) e tem que ser cortado da MESMA barra — se virar dois planos,
  // a otimização perde justamente onde mais tinha a ganhar.
  const folha = entradas.find((x) => x.perfilId === "perf_folha")!;
  assert.equal(folha.pecas.length, 80);

  const plano = planejarCorte(entradas);
  assert.ok(plano.totalBarras > 0);
  assert.ok(plano.aproveitamentoPercent > 50);
});
