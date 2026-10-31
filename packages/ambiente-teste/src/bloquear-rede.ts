import net from "node:net";
import { BANCO_TESTE } from "./config";

/**
 * Carregado antes de tudo nos processos de teste. Toda conexão TCP aberta pelo
 * JavaScript passa por net.Socket.connect, inclusive http, https, tls e fetch.
 *
 * Não alcança o motor nativo do Prisma, que abre os próprios sockets. Para ele
 * valem a guarda do banco, o log de conexões do Postgres e a sentinela do
 * sistema operacional (ver sentinela.ts).
 */

export class ConexaoBloqueada extends Error {
  constructor(public destino: string) {
    super(`conexão bloqueada pelo ambiente de teste: ${destino}`);
    this.name = "ConexaoBloqueada";
  }
}

export function destinoPermitido(host: string | undefined, porta: number | undefined): boolean {
  return (host === BANCO_TESTE.host || host === "localhost") && porta === BANCO_TESTE.porta;
}

const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function connect(this: net.Socket, ...args: unknown[]) {
  // Internamente o Node também chama connect com [opcoes, callback] em um array.
  const primeiro = Array.isArray(args[0]) ? args[0][0] : args[0];
  // Conexão por caminho é pipe local (o tsx usa), não sai da máquina.
  if (typeof primeiro === "string" && Number.isNaN(Number(primeiro))) {
    return original.apply(this, args as never);
  }
  if (primeiro && typeof primeiro === "object" && typeof (primeiro as net.IpcSocketConnectOpts).path === "string") {
    return original.apply(this, args as never);
  }
  const porta = Number(typeof primeiro === "object" && primeiro ? (primeiro as net.TcpSocketConnectOpts).port : primeiro);
  const host =
    typeof primeiro === "object" && primeiro
      ? ((primeiro as net.TcpSocketConnectOpts).host ?? "localhost")
      : typeof args[1] === "string"
        ? args[1]
        : "localhost";
  if (!destinoPermitido(host, porta)) throw new ConexaoBloqueada(`${host}:${porta}`);
  return original.apply(this, args as never);
} as typeof net.Socket.prototype.connect;

globalThis.fetch = (async (entrada: unknown) => {
  const alvo = entrada instanceof URL ? entrada.href : entrada instanceof Request ? entrada.url : String(entrada);
  let destino = "URL inválida";
  try {
    destino = new URL(alvo).host;
  } catch {
    // mantém a descrição genérica
  }
  throw new ConexaoBloqueada(destino);
}) as typeof fetch;
