/**
 * Carregado com --require em todo processo Node do ambiente local, inclusive o
 * site e os workers do Next (o NODE_OPTIONS é herdado). Três barreiras:
 *
 * 1. Sem a URL exata do banco de teste, o processo nem sobe.
 * 2. Nenhum arquivo .env do repositório pode ser lido, por qualquer biblioteca.
 * 3. Conexões do JavaScript só para este computador, nas portas do ambiente.
 *
 * Em JavaScript puro porque roda antes de qualquer transpilador.
 */
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const CODIGO_RECUSA = 78;
const PORTA_BANCO = 55432;
const PORTA_SITE = Number(process.env.DILON_TESTE_PORTA_SITE || 3199);

function recusar(motivo) {
  process.stderr.write(`[ambiente-teste] Processo recusado: ${motivo}.\n`);
  process.exit(CODIGO_RECUSA);
}

let url;
try {
  url = new URL(process.env.DATABASE_URL || "");
} catch {
  recusar("sem a URL do banco de teste");
}
const parametros = [...url.searchParams.keys()].filter((k) => k !== "schema");
if (
  (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
  url.hostname !== "127.0.0.1" ||
  Number(url.port) !== PORTA_BANCO ||
  url.pathname !== "/dilonzap_test" ||
  url.username !== "dilon_teste" ||
  parametros.length > 0
) {
  recusar("a DATABASE_URL não é a do banco de teste");
}

const raiz = path.resolve(__dirname, "../../..").toLowerCase();
function ehEnvDoRepositorio(alvo) {
  if (typeof alvo !== "string" && !(alvo instanceof URL)) return false;
  const texto = alvo instanceof URL ? alvo.pathname : alvo;
  if (!/(^|[\\/])\.env[^\\/]*$/.test(texto)) return false;
  return path.resolve(texto).toLowerCase().startsWith(raiz);
}
const naoExiste = (alvo) => Object.assign(new Error(`ENOENT: no such file or directory, open '${path.basename(String(alvo))}'`), { code: "ENOENT", errno: -2 });

for (const nome of ["readFileSync", "statSync", "lstatSync", "openSync", "accessSync"]) {
  const original = fs[nome];
  fs[nome] = function (alvo, opcoes, ...resto) {
    if (ehEnvDoRepositorio(alvo)) {
      if (opcoes && opcoes.throwIfNoEntry === false) return undefined;
      throw naoExiste(alvo);
    }
    return original.call(this, alvo, opcoes, ...resto);
  };
}
const existsSync = fs.existsSync;
fs.existsSync = (alvo) => (ehEnvDoRepositorio(alvo) ? false : existsSync(alvo));
const readFile = fs.readFile;
fs.readFile = function (alvo, ...resto) {
  if (ehEnvDoRepositorio(alvo)) {
    const fim = resto[resto.length - 1];
    return void process.nextTick(fim, naoExiste(alvo));
  }
  return readFile.call(this, alvo, ...resto);
};
const lerPromessa = fs.promises.readFile;
fs.promises.readFile = function (alvo, ...resto) {
  if (ehEnvDoRepositorio(alvo)) return Promise.reject(naoExiste(alvo));
  return lerPromessa.call(this, alvo, ...resto);
};
syncBuiltinESMExports();

const LOCAIS = new Set(["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"]);
// Portas altas são as que o Next e o sistema sorteiam para comunicação interna.
const portaPermitida = (p) => p === PORTA_BANCO || p === PORTA_SITE || p >= 49152;

const conectar = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const primeiro = Array.isArray(args[0]) ? args[0][0] : args[0];
  const ehPipe =
    (typeof primeiro === "string" && Number.isNaN(Number(primeiro))) || (primeiro && typeof primeiro === "object" && typeof primeiro.path === "string");
  if (!ehPipe) {
    const objeto = primeiro && typeof primeiro === "object";
    const porta = Number(objeto ? primeiro.port : primeiro);
    const host = objeto ? (primeiro.host ?? "localhost") : typeof args[1] === "string" ? args[1] : "localhost";
    if (!LOCAIS.has(host) || !portaPermitida(porta)) {
      const erro = new Error(`conexão bloqueada pelo ambiente de teste: ${host}:${porta}`);
      erro.code = "EACCES";
      throw erro;
    }
  }
  return conectar.apply(this, args);
};
