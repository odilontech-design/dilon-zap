import { test } from "node:test";
import assert from "node:assert/strict";
import { expandirTipologia } from "../src/tipologia";
import { planejarCorte, entradasDeCorte } from "../src/corte";
import { agregarMateriais } from "../src/materiais";
import { GRADE_FERRO } from "./fixtures";

/**
 * A relação de materiais é a lista de compra que vai pro fornecedor: errar a
 * quantidade aqui custa dinheiro de verdade, não um número feio na tela.
 */

const grade = (L: number) => expandirTipologia(GRADE_FERRO, { larguraMm: L, alturaMm: 1200, quantidade: 1 });

test("o plano de corte do orçamento não é contado uma vez por item", () => {
  const expansoes = [grade(1000), grade(1500)];

  // O plano é do orçamento inteiro: as peças dos dois itens saem das MESMAS
  // barras. Passá-lo como campo de cada item somava tudo duas vezes.
  const plano = planejarCorte(entradasDeCorte(expansoes.flatMap((e) => e.pecas)), {
    espessuraSerraMm: 2,
    sobraMinimaAproveitavelMm: 500,
  });
  const barrasPorPerfil = Object.fromEntries(plano.perfis.map((p) => [p.perfilId, p.totalBarras]));

  const linhas = agregarMateriais(expansoes.map((expansao) => ({ expansao })), barrasPorPerfil);

  for (const perfil of plano.perfis) {
    const linha = linhas.find((l) => l.insumoId === perfil.perfilId)!;
    assert.equal(linha.quantidade, perfil.totalBarras, `${perfil.perfilCodigo} deveria comprar o que o plano pediu`);
  }
});

test("sem plano de corte, estima as barras pelo metro linear e arredonda pra cima", () => {
  const linhas = agregarMateriais([{ expansao: grade(1000) }]);

  const met20 = linhas.find((l) => l.codigo === "MET-20x20")!;
  // 8 peças de 1130mm = 9,04 m; barra de 6 m ⇒ 2 barras.
  assert.equal(met20.quantidade, 2);
  assert.match(met20.detalhe, /estimado/);
});

test("soma o mesmo insumo de itens diferentes numa linha só", () => {
  const linhas = agregarMateriais([{ expansao: grade(1000) }, { expansao: grade(1500) }]);

  const eletrodo = linhas.filter((l) => l.nome.includes("Eletrodo"));
  assert.equal(eletrodo.length, 1);
  // 0,48 kg + 0,68 kg de eletrodo, sem arredondar no meio do caminho.
  assert.equal(Number(eletrodo[0].quantidade.toFixed(2)), 1.16);
});
