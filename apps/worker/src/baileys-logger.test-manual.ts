// Teste do logger filtrado que damos pro Baileys.
// Rodar com: npx tsx apps/worker/src/baileys-logger.test-manual.ts
//
// O que precisa valer: as linhas sobre saúde de criptografia passam, o resto
// do tráfego do socket (que é a maior parte, e o motivo de não subir o
// LOG_LEVEL global) é descartado, e warn/error passam sempre.
import { criarBaileysLogger } from "./baileys-logger";

const gravadas: string[] = [];
const original = process.stdout.write.bind(process.stdout);
process.stdout.write = ((linha: string) => {
  gravadas.push(linha);
  return true;
}) as typeof process.stdout.write;

const log = criarBaileysLogger();

// Devem passar: são os sinais que precisamos medir.
log.debug({ attrs: {}, key: {} }, "recv retry request");
log.info({ msgAttrs: {}, retryCount: 1 }, "sent retry receipt");
log.debug({ retryCount: 5 }, "reached retry limit, clearing");
log.error({ err: "x" }, "failed to decrypt message");
log.warn("Bad MAC");

// Devem ser descartadas: ruído do socket em debug.
log.debug({ node: {} }, "recv node");
log.debug("handling ib");
log.info({ jid: "x" }, "opened connection to WA");
log.trace("binary node written");

process.stdout.write = original;

const texto = gravadas.join("");
const passou = (t: string) => texto.includes(t);

const casos: Array<[string, boolean, boolean]> = [
  ["recv retry request", passou("recv retry request"), true],
  ["sent retry receipt", passou("sent retry receipt"), true],
  ["reached retry limit", passou("reached retry limit"), true],
  ["failed to decrypt (error)", passou("failed to decrypt"), true],
  ["Bad MAC (warn)", passou("Bad MAC"), true],
  ["recv node (ruido)", passou("recv node"), false],
  ["handling ib (ruido)", passou("handling ib"), false],
  ["opened connection (ruido)", passou("opened connection"), false],
  ["binary node (ruido)", passou("binary node"), false],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome} ${esperado ? "passa" : "e descartada"}`);
}

// child() precisa manter o filtro — o Baileys cria loggers filhos internamente.
const filho = log.child({ classe: "teste" });
const antes = gravadas.length;
process.stdout.write = ((l: string) => {
  gravadas.push(l);
  return true;
}) as typeof process.stdout.write;
filho.debug("recv node");
filho.debug("recv retry request");
process.stdout.write = original;
const doFilho = gravadas.slice(antes).join("");
const filhoOk = doFilho.includes("recv retry request") && !doFilho.includes("recv node");
if (!filhoOk) falhas++;
console.log(`${filhoOk ? "ok  " : "FALHA"}  child() mantem o filtro`);

console.log(falhas === 0 ? "\nPASSOU" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
