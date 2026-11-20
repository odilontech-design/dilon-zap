// Padrões da busca do Inbox: acento, caixa, início de palavra, caracteres especiais.
// Rodar com: npx tsx apps/web/lib/busca-texto.test-manual.ts
import assert from "node:assert/strict";
import { termosDaBusca, padraoSemAcento, INICIO_DE_PALAVRA } from "./busca-texto";

// O padrão é de Postgres ([[:alnum:]]); no JS o equivalente é p{L}p{N}.
const casa = (termo: string, texto: string) =>
  new RegExp((INICIO_DE_PALAVRA + padraoSemAcento(termo)).replace("[^[:alnum:]]", String.raw`[^\p{L}\p{N}]`), "iu").test(texto);

// Acento nos dois sentidos, e caixa.
assert.ok(casa("paraiba", "Rua da Paraíba, 123"), "sem acento acha com acento");
assert.ok(casa("Paraíba", "rua da paraiba"), "com acento acha sem acento");
assert.ok(casa("PARAÍBA", "rua da Paraíba"), "caixa alta");
assert.ok(casa("sao", "Fica em SÃO PAULO"), "ã maiúsculo");
assert.ok(casa("acucar", "Açúcar"), "cedilha");

// Início de palavra: "ibe" não casa "recebe", "flor" casa "flores".
assert.ok(!casa("ibe", "ele recebe o pedido"), "meio de palavra não casa");
assert.ok(casa("flor", "Av. das Flores, 10"), "prefixo casa");
assert.ok(casa("rua", "rua x"), "início do texto");
assert.ok(casa("123", "n. 123"), "número");
assert.ok(!casa("23", "rua 123"), "número no meio não casa");

// Caracteres especiais não quebram o padrão.
assert.ok(casa("01310-100", "CEP 01310-100"), "hífen");
assert.ok(casa("a.b", "a.b c"), "ponto é literal");
assert.ok(!casa("a.b", "axb c"), "ponto não é coringa");
assert.ok(casa("(11)", "tel (11) 9999"), "parêntese");

assert.deepEqual(termosDaBusca("  rua   das flores "), ["rua", "das", "flores"]);
assert.deepEqual(termosDaBusca(""), []);
assert.deepEqual(termosDaBusca("T."), ["T."], "só uma inicial: usa o que foi digitado");

console.log("busca-texto: ok");
