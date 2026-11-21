import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDoAtestado, duracaoEmMinutos, resumoSolicitacao } from "./solicitacoes-regras";

const comercial = {
  "0": [],
  "1": [["08:00", "12:00"], ["13:00", "17:00"]],
  "2": [["08:00", "12:00"], ["13:00", "17:00"]],
  "3": [["08:00", "12:00"], ["13:00", "17:00"]],
  "4": [["08:00", "12:00"], ["13:00", "17:00"]],
  "5": [["08:00", "12:00"], ["13:00", "17:00"]],
  "6": [["08:00", "12:00"]],
} as Record<string, Array<[string, string]>>;

test("atestado abona o previsto de cada dia e pula domingo e feriado", () => {
  // 2026-11-13 (sex) a 2026-11-16 (seg); 15/11 é domingo; 16/11 vira feriado no teste.
  const dias = diasDoAtestado("2026-11-13", "2026-11-17", comercial, new Set(["2026-11-16"]));
  assert.deepEqual(dias, [
    { data: "2026-11-13", minutos: 480 },
    { data: "2026-11-14", minutos: 240 },
    { data: "2026-11-17", minutos: 480 },
  ]);
});

test("atestado no turno da noite conta o turno que passa da meia-noite", () => {
  const noturno = { "1": [["22:00", "02:00"], ["03:00", "06:00"]] } as Record<string, Array<[string, string]>>;
  assert.deepEqual(diasDoAtestado("2026-11-16", "2026-11-16", noturno, new Set()), [{ data: "2026-11-16", minutos: 420 }]);
});

test("atestado recusa período invertido e longo demais", () => {
  assert.throws(() => diasDoAtestado("2026-11-10", "2026-11-09", comercial, new Set()));
  assert.throws(() => diasDoAtestado("2026-01-01", "2026-04-01", comercial, new Set()));
});

test("duração do abono", () => {
  assert.equal(duracaoEmMinutos("2:30"), 150);
  assert.equal(duracaoEmMinutos("00:00"), null);
  assert.equal(duracaoEmMinutos("25:00"), null);
  assert.equal(duracaoEmMinutos("abc"), null);
});

test("resumo", () => {
  assert.equal(resumoSolicitacao({ tipo: "INCLUSAO", data: "2026-11-20", hora: "08:00" }), "Incluir 08:00 em 20/11/2026");
  assert.equal(resumoSolicitacao({ tipo: "ABONO", data: "2026-11-20", minutos: 90 }), "Abonar 1h30 em 20/11/2026");
  assert.equal(resumoSolicitacao({ tipo: "ATESTADO", data: "2026-11-20", dataFim: "2026-11-22" }), "Atestado de 20/11/2026 a 22/11/2026");
});
