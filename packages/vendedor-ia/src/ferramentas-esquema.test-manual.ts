// Esquemas das ferramentas do vendedor: a API da Anthropic recusa (erro 400) o que o modo estrito não aceita,
// e o teste de conexão do Super Admin não envia ferramentas, então só aparece com cliente de verdade.
// Rodar com: npx tsx src/ferramentas-esquema.test-manual.ts
import assert from "node:assert/strict";
import { FERRAMENTAS } from "./prompt";

type No = Record<string, unknown>;

function percorrer(no: unknown, caminho: string, falhas: string[]) {
  if (!no || typeof no !== "object") return;
  const n = no as No;
  // O erro real de produção (24/11): type ["string","null"] junto com enum.
  if (Array.isArray(n.type) && "enum" in n) falhas.push(`${caminho}: enum junto com type em lista (use anyOf)`);
  for (const [k, v] of Object.entries(n)) {
    if (Array.isArray(v)) v.forEach((x, i) => percorrer(x, `${caminho}.${k}[${i}]`, falhas));
    else percorrer(v, `${caminho}.${k}`, falhas);
  }
}

const falhas: string[] = [];
for (const f of FERRAMENTAS) {
  const esquema = f.input_schema as No;
  percorrer(esquema, f.name, falhas);
  const props = Object.keys((esquema.properties as No) ?? {});
  const obrigatorios = (esquema.required as string[]) ?? [];
  for (const p of props) if (!obrigatorios.includes(p)) falhas.push(`${f.name}.${p}: no modo estrito todo campo é obrigatório`);
  if (esquema.additionalProperties !== false) falhas.push(`${f.name}: additionalProperties deve ser false`);
}
assert.deepEqual(falhas, [], falhas.join("\n"));

// O câmbio continua aceitando manual, automatico ou null.
const cambio = ((FERRAMENTAS.find((f) => f.name === "buscar_estoque")!.input_schema as No).properties as Record<string, No>).cambio;
assert.deepEqual(cambio.anyOf, [{ type: "string", enum: ["manual", "automatico"] }, { type: "null" }]);

console.log("ferramentas-esquema: ok");
