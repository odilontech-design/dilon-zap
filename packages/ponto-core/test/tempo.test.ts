import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarMinutos, hhmm, minutoLocal, somarDias } from "../src/tempo";

test("hhmm converte horário em minutos e aceita deslocamento de dia", () => {
  assert.equal(hhmm("08:30"), 510);
  assert.equal(hhmm("00:00"), 0);
  assert.equal(hhmm("06:00", 1), 1800);
  assert.equal(hhmm("23:00", -1), -60);
});

test("hhmm recusa horário malformado em vez de chutar", () => {
  assert.throws(() => hhmm("25:00"));
  assert.throws(() => hhmm("08:60"));
  assert.throws(() => hhmm("8h"));
});

test("formatarMinutos mostra sinal e zero à esquerda nos minutos", () => {
  assert.equal(formatarMinutos(125), "2:05");
  assert.equal(formatarMinutos(-30), "-0:30");
  assert.equal(formatarMinutos(0), "0:00");
});

test("minutoLocal: 01:15 UTC é 22:15 do dia anterior em São Paulo", () => {
  assert.equal(minutoLocal("2026-11-11T01:15:00Z", "2026-11-10", "America/Sao_Paulo"), 1335);
});

test("minutoLocal: o mesmo instante visto do dia seguinte é negativo", () => {
  assert.equal(minutoLocal("2026-11-11T01:15:00Z", "2026-11-11", "America/Sao_Paulo"), -105);
});

test("minutoLocal respeita o fuso da unidade, não o do servidor (Manaus, UTC-4)", () => {
  assert.equal(minutoLocal("2026-11-11T01:15:00Z", "2026-11-10", "America/Manaus"), 1275);
});

test("minutoLocal descarta os segundos, como o registro de ponto", () => {
  assert.equal(minutoLocal("2026-11-10T11:00:59Z", "2026-11-10", "America/Sao_Paulo"), 480);
});

test("somarDias atravessa fevereiro de ano não bissexto", () => {
  assert.equal(somarDias("2026-01-31", 30), "2026-03-02");
  assert.equal(somarDias("2026-01-10", 180), "2026-07-09");
});
