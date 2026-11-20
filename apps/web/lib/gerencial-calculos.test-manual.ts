// Contas do painel gerencial: mês em horário de Brasília, variação, ticket e meta.
// Rodar com: npx tsx apps/web/lib/gerencial-calculos.test-manual.ts
import assert from "node:assert/strict";
import { janelaDoMes, progressoDaMeta, ticketMedio, variacaoPercentual } from "./gerencial-calculos";

// 20/11/2026 meio-dia em Brasília (15h UTC).
const j = janelaDoMes(new Date("2026-11-20T15:00:00Z"));
assert.equal(j.mes, "2026-11");
assert.equal(j.inicio.toISOString(), "2026-11-01T03:00:00.000Z", "mês começa à meia-noite de Brasília");
assert.equal(j.fim.toISOString(), "2026-12-01T03:00:00.000Z");
assert.equal(j.inicioAnterior.toISOString(), "2026-10-01T03:00:00.000Z");
assert.equal(j.diasNoMes, 30);
assert.equal(j.diaDoMes, 20);

// 01/12 01h UTC ainda é 30/11 22h em Brasília: continua em novembro.
const virada = janelaDoMes(new Date("2026-12-01T01:00:00Z"));
assert.equal(virada.mes, "2026-11");
assert.equal(virada.diaDoMes, 30);
// 01/12 03h UTC já é dezembro.
assert.equal(janelaDoMes(new Date("2026-12-01T03:00:00Z")).mes, "2026-12");
// Janeiro volta para dezembro do ano anterior.
assert.equal(janelaDoMes(new Date("2027-01-15T12:00:00Z")).inicioAnterior.toISOString(), "2026-12-01T03:00:00.000Z");
// Fevereiro de ano comum e bissexto.
assert.equal(janelaDoMes(new Date("2027-02-10T12:00:00Z")).diasNoMes, 28);
assert.equal(janelaDoMes(new Date("2028-02-10T12:00:00Z")).diasNoMes, 29);

// Variação.
assert.equal(variacaoPercentual(120, 100), 20);
assert.equal(variacaoPercentual(80, 100), -20);
assert.equal(variacaoPercentual(50, 0), null, "sem mês anterior não há comparação");

// Ticket médio.
assert.equal(ticketMedio(10000, 4), 2500);
assert.equal(ticketMedio(0, 0), 0);

// Meta.
assert.equal(progressoDaMeta(5000, null, 10, 30), null);
assert.equal(progressoDaMeta(5000, 0, 10, 30), null);
const p = progressoDaMeta(50000, 100000, 15, 30)!;
assert.equal(p.percentual, 50);
assert.equal(p.faltaCents, 50000);
assert.equal(p.projecaoCents, 100000);
assert.equal(p.noRitmo, true, "50% no meio do mês = no ritmo");
assert.equal(progressoDaMeta(30000, 100000, 15, 30)!.noRitmo, false);
const passou = progressoDaMeta(120000, 100000, 20, 30)!;
assert.equal(passou.percentual, 120);
assert.equal(passou.faltaCents, 0);

console.log("gerencial-calculos: ok");
