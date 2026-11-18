import assert from "node:assert/strict";
import { limiteDoAnexo, mensagemDeTamanho, LIMITE_DOCUMENTO_BYTES, LIMITE_MIDIA_BYTES } from "./anexo-limite";

assert.equal(LIMITE_MIDIA_BYTES, 16 * 1024 * 1024);
assert.equal(LIMITE_DOCUMENTO_BYTES, 50 * 1024 * 1024);
for (const t of ["IMAGE", "VIDEO", "AUDIO"] as const) assert.equal(limiteDoAnexo(t), 16 * 1024 * 1024, `${t} segue 16MB`);
assert.equal(limiteDoAnexo("DOCUMENT"), 50 * 1024 * 1024);
assert.match(mensagemDeTamanho("DOCUMENT"), /50MB/);
assert.match(mensagemDeTamanho("IMAGE"), /16MB/);
console.log("anexo-limite: ok");
