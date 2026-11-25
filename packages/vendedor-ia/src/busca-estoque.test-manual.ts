// Busca do estoque sem depender de acento.
// Rodar com: npx tsx src/busca-estoque.test-manual.ts
import assert from "node:assert/strict";
import { combinaComABusca, semAcento } from "./busca-estoque";

assert.equal(semAcento("Citroën"), "citroen");
assert.equal(semAcento("  ÇA Água  "), "ca agua");
assert.equal(semAcento("Škoda"), "skoda");

const c3 = { marca: "Citroen", modelo: "C3", versao: "1.6 TENDANCE 16V FLEX 4P AUTOMÁTICO" };
// O caso real: a IA escreveu "Citroën" e o cadastro tem "Citroen".
assert.ok(combinaComABusca(c3, ["Citroën", "C3"], null), "Citroën acha Citroen");
assert.ok(combinaComABusca(c3, ["c3"], "Citroën"), "marca com trema acha a marca sem trema");
assert.ok(combinaComABusca(c3, ["citroen"], null), "o contrário também");
assert.ok(combinaComABusca(c3, ["automatico"], null), "versão sem acento acha AUTOMÁTICO");
assert.ok(combinaComABusca(c3, ["tendance", "1.6"], null), "palavras em qualquer ordem");
assert.ok(!combinaComABusca(c3, ["c4"], null), "outro modelo não passa");
assert.ok(!combinaComABusca(c3, ["c3"], "Ford"), "outra marca não passa");
assert.ok(!combinaComABusca(c3, ["c3", "cactus"], null), "todas as palavras precisam casar");
assert.ok(combinaComABusca(c3, [], null), "sem filtro, tudo passa");
assert.ok(combinaComABusca({ marca: "Fiat", modelo: "Argo", versao: null }, ["argo"], null), "versão vazia não quebra");

console.log("busca-estoque: ok");
