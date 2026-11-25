// Primeiro nome do cliente para a IA.
// Rodar com: npx tsx src/nome.test-manual.ts
import assert from "node:assert/strict";
import { primeiroNomeDoCliente as n } from "./nome";

assert.equal(n("Victor Hugo"), "Victor");
assert.equal(n("🌷 Edlaine Santana 🌷"), "Edlaine", "emoji sai");
assert.equal(n("FELIPE CERQUEIRA"), "Felipe", "maiúsculas viram nome próprio");
assert.equal(n("joão"), "João", "acento preservado");
assert.equal(n("Dr. Carlos Roberto"), "Carlos", "título não é nome");
assert.equal(n("Ana-Clara Souza"), "Ana-clara");
assert.equal(n("+55 21 96762-9631"), null, "só número de telefone");
assert.equal(n("5521967629631"), null);
assert.equal(n("~"), null);
assert.equal(n("  "), null);
assert.equal(n(null), null);
assert.equal(n(undefined), null);
assert.equal(n("J"), null, "uma letra só não serve");
assert.equal(n("J Silva"), "Silva", "pula a inicial solta");
console.log("nome: ok");
