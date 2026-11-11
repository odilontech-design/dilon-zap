import { test } from "node:test";
import assert from "node:assert/strict";
import { feriadosNacionais, pascoa } from "../src/feriados";

test("Páscoa de anos conhecidos", () => {
  assert.equal(pascoa(2024), "2024-03-31");
  assert.equal(pascoa(2025), "2025-04-20");
  assert.equal(pascoa(2026), "2026-04-05");
  assert.equal(pascoa(2027), "2027-03-28");
});

test("Sexta-feira Santa é dois dias antes da Páscoa", () => {
  const sexta = feriadosNacionais(2026).find((f) => f.nome === "Sexta-feira Santa");
  assert.equal(sexta?.data, "2026-04-03");
});

test("Consciência Negra é nacional a partir de 2024", () => {
  assert.ok(feriadosNacionais(2024).some((f) => f.data === "2024-11-20"));
  assert.ok(!feriadosNacionais(2023).some((f) => f.data === "2023-11-20"));
});

test("2026 tem 10 feriados nacionais, em ordem de data", () => {
  const lista = feriadosNacionais(2026);
  assert.equal(lista.length, 10);
  assert.deepEqual(
    lista.map((f) => f.data),
    [...lista.map((f) => f.data)].sort(),
  );
});

test("Carnaval não é feriado nacional", () => {
  assert.ok(!feriadosNacionais(2026).some((f) => f.nome.toLowerCase().includes("carnaval")));
});
