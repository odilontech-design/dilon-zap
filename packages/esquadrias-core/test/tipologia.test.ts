import { test } from "node:test";
import assert from "node:assert/strict";
import { expandirTipologia } from "../src/tipologia";
import { JANELA_2_FOLHAS } from "./fixtures";

test("expande a janela 1200x1000 nas peças reais", () => {
  const e = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 1 });

  const trilho = e.pecas.find((p) => p.templateId === "p1")!;
  assert.equal(trilho.quantidade, 2);
  assert.equal(trilho.comprimentoMm, 1200);
  // 2 barras de 1,2m a 0,5 kg/m = 1,2 kg; a R$ 45,00/kg = R$ 54,00
  assert.equal(trilho.custoCentavos, 5400);

  const folhaVertical = e.pecas.find((p) => p.templateId === "p3")!;
  assert.equal(folhaVertical.comprimentoMm, 980); // H - 2 * folga(10)

  const folhaHorizontal = e.pecas.find((p) => p.templateId === "p4")!;
  assert.equal(folhaHorizontal.comprimentoMm, 590); // L/2 - folga

  const vidro = e.vidros[0];
  assert.equal(vidro.quantidade, 2);
  assert.equal(vidro.larguraMm, 588);
  assert.equal(vidro.alturaMm, 988);

  assert.equal(e.ferragens.reduce((a, f) => a + f.quantidade, 0), 5);
  assert.equal(e.areaM2, 1.2);
  assert.equal(e.areaTotalM2, 1.2);
});

test("quantidade do item multiplica tudo, inclusive o custo", () => {
  const um = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 1 });
  const tres = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 3 });

  assert.equal(tres.pecas[0].quantidade, um.pecas[0].quantidade * 3);
  assert.equal(tres.custoAluminioCentavos, um.custoAluminioCentavos * 3);
  assert.equal(tres.areaTotalM2, 3.6);
});

test("parâmetro sobrescrito no item muda o corte", () => {
  const padrao = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 1 });
  const comFolgaMaior = expandirTipologia(JANELA_2_FOLHAS, {
    larguraMm: 1200, alturaMm: 1000, quantidade: 1, parametros: { folga: 20 },
  });

  assert.equal(padrao.pecas.find((p) => p.templateId === "p3")!.comprimentoMm, 980);
  assert.equal(comFolgaMaior.pecas.find((p) => p.templateId === "p3")!.comprimentoMm, 960);
});

test("cor com fator encarece o alumínio sem tocar no vidro", () => {
  const natural = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 1200, alturaMm: 1000, quantidade: 1 });
  const preto = expandirTipologia(
    JANELA_2_FOLHAS,
    { larguraMm: 1200, alturaMm: 1000, quantidade: 1 },
    { aluminio: 1.35, ferragem: 1.1 },
  );

  assert.equal(preto.custoAluminioCentavos, Math.round(natural.custoAluminioCentavos * 1.35));
  assert.equal(preto.custoVidroCentavos, natural.custoVidroCentavos);
});

test("recusa peça maior que a barra em vez de gerar um corte impossível", () => {
  // 7m de vão com barra de 6m: o erro tem que aparecer no orçamento, não na
  // bancada de corte com o alumínio já comprado.
  assert.throws(
    () => expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 7000, alturaMm: 1000, quantidade: 1 }),
    /barra do perfil 25\.01/,
  );
});

test("vidro pequeno é cobrado pelo mínimo da vidraçaria", () => {
  const e = expandirTipologia(JANELA_2_FOLHAS, { larguraMm: 600, alturaMm: 500, quantidade: 1 });
  const vidro = e.vidros[0];
  assert.ok(vidro.m2Unitario < 0.5);
  assert.equal(vidro.m2CobradoUnitario, 0.5);
  assert.equal(vidro.custoCentavos, Math.round(0.5 * 2 * 9000));
});
