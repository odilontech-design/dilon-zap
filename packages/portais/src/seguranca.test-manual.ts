// Segurança dos portais. Rodar com: npx tsx packages/portais/src/seguranca.test-manual.ts
import { randomBytes } from "node:crypto";
import { assinarEstado, assinarFoto, cifrar, chaveDoAmbiente, decifrar, fotoAssinadaValida, lerEstado } from "./seguranca";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const erro = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as Error).message; } };

const chave = randomBytes(32);
const guardado = cifrar("token-secreto-123", chave);
checa("cifra e decifra", decifrar(guardado, chave), "token-secreto-123");
checa("não guarda em claro", guardado.includes("token-secreto"), false);
checa("cada cifra é diferente", cifrar("x", chave) === cifrar("x", chave), false);
checa("chave errada falha", erro(() => decifrar(guardado, randomBytes(32))) !== null, true);
const adulterado = guardado.slice(0, -2) + (guardado.endsWith("A") ? "BB" : "AA");
checa("texto adulterado falha", erro(() => decifrar(adulterado, chave)) !== null, true);
checa("chave do ambiente valida tamanho", erro(() => chaveDoAmbiente(Buffer.alloc(10).toString("base64"))), "PORTAIS_CHAVE precisa ter 32 bytes em base64");

const agora = Date.now();
const estado = assinarEstado({ tenantId: "t1", userId: "u1", portal: "OLX" }, "segredo", agora);
checa("estado válido", lerEstado(estado, "segredo", agora + 1000), { tenantId: "t1", userId: "u1", portal: "OLX" });
checa("estado com outro segredo", lerEstado(estado, "outro", agora), null);
checa("estado vencido", lerEstado(estado, "segredo", agora + 16 * 60_000), null);
const [corpo, ass] = estado.split(".");
const forjado = Buffer.from(JSON.stringify({ tenantId: "t2", userId: "u1", portal: "OLX", exp: agora + 999999 })).toString("base64url");
checa("estado forjado", lerEstado(`${forjado}.${ass}`, "segredo", agora), null);
checa("corpo intacto continua valendo", lerEstado(`${corpo}.${ass}`, "segredo", agora) !== null, true);

const a = assinarFoto("foto1", "segredo");
checa("foto assinada", fotoAssinadaValida("foto1", a, "segredo"), true);
checa("assinatura não serve para outra foto", fotoAssinadaValida("foto2", a, "segredo"), false);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
