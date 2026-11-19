import assert from "node:assert/strict";
import { lerSimulacao, simulacaoDaBusca, simulacaoParaBusca } from "./simulacao-parcelas";

const ok = { entradaCents: 10000, numParcelas: 4, periodicidade: "MENSAL", primeiroVencimento: "2026-12-10" };

assert.deepEqual(lerSimulacao(ok), ok);
assert.deepEqual(lerSimulacao({ ...ok, entradaCents: undefined }), { ...ok, entradaCents: 0 }, "sem entrada vale zero");
assert.equal(lerSimulacao(null), null);
assert.equal(lerSimulacao("x"), null);
assert.equal(lerSimulacao({ ...ok, numParcelas: 0 }), null, "zero parcelas");
assert.equal(lerSimulacao({ ...ok, numParcelas: 61 }), null, "acima do máximo");
assert.equal(lerSimulacao({ ...ok, numParcelas: 2.5 }), null, "fração");
assert.equal(lerSimulacao({ ...ok, entradaCents: -1 }), null, "entrada negativa");
assert.equal(lerSimulacao({ ...ok, periodicidade: "ANUAL" }), null, "periodicidade desconhecida");
assert.equal(lerSimulacao({ ...ok, primeiroVencimento: "10/12/2026" }), null, "data fora do formato");
assert.equal(lerSimulacao({ ...ok, primeiroVencimento: "2026-13-40" }), null, "data impossível");

// Ida e volta pela query da prévia.
const busca = new URLSearchParams(simulacaoParaBusca(ok as never));
assert.deepEqual(simulacaoDaBusca(busca), ok);
assert.equal(simulacaoDaBusca(new URLSearchParams("documento=1")), null, "sem simParcelas não há simulação");

console.log("simulacao-parcelas: ok");
