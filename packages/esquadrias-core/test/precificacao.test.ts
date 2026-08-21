import { test } from "node:test";
import assert from "node:assert/strict";
import { expandirTipologia } from "../src/tipologia";
import { precificarItem, totalizarOrcamento, REGRAS_PADRAO } from "../src/precificacao";
import { JANELA_2_FOLHAS } from "./fixtures";

const expansao = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 1 });

test("margem de 100% dobra o custo — a conta que o vendedor faz na mão", () => {
  const p = precificarItem(expansao, { ...REGRAS_PADRAO, perdaAluminioPercent: 0 }, {});
  assert.equal(p.lucroCentavos, p.custoTotalCentavos);
  assert.equal(p.subtotalCentavos, p.custoTotalCentavos * 2);
  assert.equal(p.totalCentavos, p.subtotalCentavos);
});

test("perda de alumínio entra no custo", () => {
  const sem = precificarItem(expansao, { ...REGRAS_PADRAO, perdaAluminioPercent: 0 });
  const com = precificarItem(expansao, { ...REGRAS_PADRAO, perdaAluminioPercent: 10 });

  assert.equal(com.perdaAluminioCentavos, Math.round(expansao.custoAluminioCentavos * 0.1));
  assert.equal(com.custoTotalCentavos, sem.custoTotalCentavos + com.perdaAluminioCentavos);
});

test("mão de obra por m² e por % somam", () => {
  const p = precificarItem(expansao, {
    ...REGRAS_PADRAO, perdaAluminioPercent: 0, maoDeObraPorM2Centavos: 5000, maoDeObraPercentSobreCusto: 10,
  });
  const material = expansao.custoAluminioCentavos + expansao.custoVidroCentavos + expansao.custoFerragemCentavos;
  assert.equal(p.maoDeObraCentavos, Math.round(1.2 * 5000) + Math.round(material * 0.1));
});

test("acréscimo e desconto do item entram depois da margem", () => {
  const base = precificarItem(expansao, REGRAS_PADRAO);
  const comAcrescimo = precificarItem(expansao, REGRAS_PADRAO, { acrescimoCentavos: 20000 });
  const comDesconto = precificarItem(expansao, REGRAS_PADRAO, { descontoCentavos: 20000 });

  assert.equal(comAcrescimo.totalCentavos, base.totalCentavos + 20000);
  assert.equal(comDesconto.totalCentavos, base.totalCentavos - 20000);
  assert.equal(comAcrescimo.subtotalCentavos, base.subtotalCentavos);
});

test("margem do item sobrescreve a da empresa", () => {
  const p = precificarItem(expansao, REGRAS_PADRAO, { margemLucroPercent: 60 });
  assert.equal(p.margemLucroPercent, 60);
  assert.equal(p.lucroCentavos, Math.round(p.custoTotalCentavos * 0.6));
});

test("imposto por fora não come a margem", () => {
  const semImposto = precificarItem(expansao, { ...REGRAS_PADRAO, impostoPercent: 0 });
  const comImposto = precificarItem(expansao, { ...REGRAS_PADRAO, impostoPercent: 6 });

  assert.equal(comImposto.lucroCentavos, semImposto.lucroCentavos);
  assert.equal(comImposto.totalCentavos, semImposto.totalCentavos + comImposto.impostoCentavos);
});

test("desconto de cabeçalho derruba a margem efetiva do orçamento", () => {
  const itens = [
    { totalCentavos: 100_000, custoTotalCentavos: 50_000 },
    { totalCentavos: 100_000, custoTotalCentavos: 50_000 },
  ];

  const cheio = totalizarOrcamento(itens);
  assert.equal(cheio.totalCentavos, 200_000);
  assert.equal(cheio.margemEfetivaPercent, 50);

  const comDesconto = totalizarOrcamento(itens, { descontoPercent: 10, freteCentavos: 5_000 });
  assert.equal(comDesconto.descontoCentavos, 20_000);
  assert.equal(comDesconto.totalCentavos, 185_000);
  assert.equal(comDesconto.lucroCentavos, 85_000);
});

test("desconto nunca passa do subtotal", () => {
  const t = totalizarOrcamento([{ totalCentavos: 10_000, custoTotalCentavos: 4_000 }], { descontoCentavos: 999_999 });
  assert.equal(t.descontoCentavos, 10_000);
  assert.equal(t.totalCentavos, 0);
});
