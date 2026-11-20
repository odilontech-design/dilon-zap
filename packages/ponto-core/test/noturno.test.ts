import { test } from "node:test";
import assert from "node:assert/strict";
import { minutosNoturnos, noturnoReduzido } from "../src/noturno";
import { REGRAS_CLT_PADRAO, regras } from "../src/regras";
import { hhmm } from "../src/tempo";

const R = REGRAS_CLT_PADRAO;
const p = (inicio: number, fim: number) => ({ inicio, fim });

test("22:00–05:00: 7 horas reais viram 8 horas noturnas", () => {
  const real = minutosNoturnos([p(hhmm("22:00"), hhmm("05:00", 1))], R);
  assert.equal(real, 420);
  assert.equal(noturnoReduzido(real, R), 480);
});

test("20:00–02:00: só a parte depois das 22h é noturna", () => {
  assert.equal(minutosNoturnos([p(hhmm("20:00"), hhmm("02:00", 1))], R), 240);
});

test("madrugada do mesmo dia (04:00–08:00) pega a janela que começou na véspera", () => {
  assert.equal(minutosNoturnos([p(hhmm("04:00"), hhmm("08:00"))], R), 60);
});

test("Súmula 60: 19:00–07:00 cumpre a janela inteira e as horas depois das 5h também são noturnas", () => {
  assert.equal(minutosNoturnos([p(hhmm("19:00"), hhmm("07:00", 1))], R), 420 + 120);
});

test("sem prorrogação ligada, 19:00–07:00 tem só as 7 horas da janela", () => {
  const semProrrogacao = regras({ noturno: { ...R.noturno, prorrogacao: false } });
  assert.equal(minutosNoturnos([p(hhmm("19:00"), hhmm("07:00", 1))], semProrrogacao), 420);
});

test("quem entra às 23:00 não cumpriu a janela inteira: 05:00–07:00 não prorroga", () => {
  assert.equal(minutosNoturnos([p(hhmm("23:00"), hhmm("07:00", 1))], R), 360);
});

test("intervalo no meio da noite não quebra a prorrogação", () => {
  const periodos = [p(hhmm("22:00"), hhmm("02:00", 1)), p(hhmm("03:00", 1), hhmm("07:00", 1))];
  // 22–02 (240) + 03–05 (120) + prorrogação 05–07 (120)
  assert.equal(minutosNoturnos(periodos, R), 480);
});

test("redução arredonda para o minuto mais próximo e pode ser desligada", () => {
  assert.equal(noturnoReduzido(60, R), 69); // 60 × 8/7 = 68,57
  assert.equal(noturnoReduzido(60, regras({ noturno: { ...R.noturno, horaReduzida: false } })), 60);
});

test("faixa noturna de convenção (21h–5h) é respeitada", () => {
  const cct = regras({ noturno: { ...R.noturno, inicioMin: hhmm("21:00") } });
  assert.equal(minutosNoturnos([p(hhmm("20:00"), hhmm("23:00"))], cct), 120);
});
