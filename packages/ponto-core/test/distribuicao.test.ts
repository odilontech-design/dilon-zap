import { test } from "node:test";
import assert from "node:assert/strict";
import { distribuirMarcacoes, iniciosDasJanelas } from "../src/distribuicao";
import { hhmm } from "../src/tempo";
import { COMERCIAL, NOTURNO } from "./fixtures";

const dia = (n: number, h: string) => n * 1440 + hhmm(h);

test("comercial: cada dia começa às 04:00", () => {
  assert.deepEqual(iniciosDasJanelas([COMERCIAL, COMERCIAL]), [hhmm("04:00"), 1440 + hhmm("04:00")]);
});

test("noturno: a saída das 06:00 fica no dia em que o turno começou", () => {
  const marcacoes = [dia(0, "22:00"), dia(1, "02:00"), dia(1, "03:00"), dia(1, "06:00")];
  const porDia = distribuirMarcacoes(marcacoes, [NOTURNO, NOTURNO]);
  assert.deepEqual(porDia[0], [hhmm("22:00"), hhmm("02:00", 1), hhmm("03:00", 1), hhmm("06:00", 1)]);
  assert.deepEqual(porDia[1], []);
});

test("folga depois de turno noturno não rouba a saída da madrugada", () => {
  // Sábado noturno (22:00–06:00), domingo de folga
  const inicios = iniciosDasJanelas([NOTURNO, []]);
  assert.equal(inicios[1], dia(1, "08:00")); // 06:00 + 2h, depois das 04:00 padrão
  const porDia = distribuirMarcacoes([dia(0, "22:00"), dia(1, "06:00")], [NOTURNO, []]);
  assert.equal(porDia[0].length, 2);
  assert.equal(porDia[1].length, 0);
});

test("devolve as marcações na linha do tempo do próprio dia", () => {
  const porDia = distribuirMarcacoes([dia(0, "08:00"), dia(0, "17:00"), dia(1, "08:00"), dia(1, "17:00")], [
    COMERCIAL,
    COMERCIAL,
  ]);
  assert.deepEqual(porDia, [
    [hhmm("08:00"), hhmm("17:00")],
    [hhmm("08:00"), hhmm("17:00")],
  ]);
});

test("marcação antes da janela do primeiro dia é descartada (pertence ao dia anterior)", () => {
  const porDia = distribuirMarcacoes([hhmm("02:00"), hhmm("08:00")], [COMERCIAL]);
  assert.deepEqual(porDia, [[hhmm("08:00")]]);
});

test("hora extra que entra pela madrugada continua no mesmo dia", () => {
  const porDia = distribuirMarcacoes([dia(0, "08:00"), dia(1, "01:00")], [COMERCIAL, COMERCIAL]);
  assert.deepEqual(porDia[0], [hhmm("08:00"), hhmm("01:00", 1)]);
});
