import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import { ARQUIVO_DA_PASTA, BANCO_TESTE, PREFIXO_PASTA } from "./config";
import { normalizarPasta } from "./guarda-banco";

const executar = promisify(execFile);

/** Razão para NÃO apagar a pasta, ou null se for seguro. Só apaga o que este pacote criou. */
export function motivoParaNaoRemover(pasta: string, base: string = os.tmpdir()): string | null {
  const alvo = normalizarPasta(pasta);
  const temporaria = normalizarPasta(base);
  if (!alvo.startsWith(`${temporaria}/`)) return "a pasta está fora da pasta temporária";
  if (!path.basename(pasta).startsWith(PREFIXO_PASTA)) return "a pasta não tem o prefixo do ambiente de teste";
  if (!existsSync(path.join(pasta, ARQUIVO_DA_PASTA))) return "a pasta não tem o arquivo do ambiente de teste";
  if (existsSync(path.join(pasta, "pgdata", "postmaster.pid"))) return "o Postgres ainda não encerrou (postmaster.pid presente)";
  return null;
}

function portaAberta(porta: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: BANCO_TESTE.host, port: porta });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export type Encerramento = { encerrado: boolean; removida: boolean; detalhe: string };

export class BancoTeste {
  readonly pasta: string;
  readonly pastaDados: string;
  readonly senha = randomBytes(24).toString("hex");
  readonly marca = randomUUID();
  /** Hosts informados pelo Postgres em cada conexão recebida (log_connections). */
  readonly hostsConectados = new Map<string, number>();
  private pg: EmbeddedPostgres;
  private iniciado = false;

  constructor() {
    this.pasta = mkdtempSync(path.join(os.tmpdir(), PREFIXO_PASTA));
    writeFileSync(path.join(this.pasta, ARQUIVO_DA_PASTA), "criada pelo ambiente de teste do Dilon Zap\n");
    this.pastaDados = path.join(this.pasta, "pgdata");
    this.pg = new EmbeddedPostgres({
      databaseDir: this.pastaDados,
      port: BANCO_TESTE.porta,
      user: BANCO_TESTE.usuario,
      password: this.senha,
      authMethod: "scram-sha-256",
      // A pasta é apagada por remover(), depois do encerramento confirmado.
      persistent: true,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      postgresFlags: ["-c", `listen_addresses=${BANCO_TESTE.host}`, "-c", "log_connections=on", "-c", "fsync=off"],
      onLog: (mensagem) => this.lerLog(String(mensagem)),
      onError: () => undefined,
    });
  }

  private lerLog(mensagem: string) {
    for (const m of mensagem.matchAll(/connection received: host=(\S+)/g)) {
      this.hostsConectados.set(m[1], (this.hostsConectados.get(m[1]) ?? 0) + 1);
    }
  }

  async iniciar() {
    await this.pg.initialise();
    await this.pg.start();
    this.iniciado = true;
    await this.pg.createDatabase(BANCO_TESTE.banco);
  }

  cliente(banco: string = BANCO_TESTE.banco) {
    return this.pg.getPgClient(banco, BANCO_TESTE.host);
  }

  /** Grava a marca: um UUID desta execução, em um schema que só este banco tem. */
  async gravarMarca() {
    const cliente = this.cliente();
    await cliente.connect();
    try {
      await cliente.query(`create schema ambiente_teste`);
      await cliente.query(`create table ambiente_teste.marca (valor uuid primary key, criada_em timestamptz not null default now())`);
      await cliente.query(`insert into ambiente_teste.marca (valor) values ($1)`, [this.marca]);
    } finally {
      await cliente.end();
    }
  }

  /**
   * O stop() do pacote usa `taskkill /f` no Windows, que mata o processo e não
   * encerra o banco de verdade. Por isso o encerramento vai pelo pg_ctl, que
   * espera o Postgres sair e só então devolve sucesso.
   */
  async encerrar(ambiente: NodeJS.ProcessEnv): Promise<{ ok: boolean; detalhe: string }> {
    if (!this.iniciado) return { ok: true, detalhe: "o servidor não chegou a iniciar" };
    const { pg_ctl } = (await import("@embedded-postgres/windows-x64")) as unknown as { pg_ctl: string };
    try {
      await executar(pg_ctl, ["stop", "-D", this.pastaDados, "-m", "fast", "-w", "-t", "30"], { env: ambiente });
    } catch {
      return { ok: false, detalhe: "o pg_ctl não confirmou o encerramento" };
    }
    // O stop() do pacote esperaria um evento de saída que já aconteceu e nunca
    // voltaria. Sem o processo registrado, o gancho de saída dele também não age.
    (this.pg as unknown as { process?: unknown }).process = undefined;

    let status = -1;
    try {
      await executar(pg_ctl, ["status", "-D", this.pastaDados], { env: ambiente });
      status = 0;
    } catch (e) {
      status = (e as { code?: number }).code ?? -1;
    }
    // O pg_ctl status devolve 3 quando não há servidor rodando na pasta.
    if (status !== 3) return { ok: false, detalhe: `o pg_ctl status devolveu ${status}` };
    if (await portaAberta(BANCO_TESTE.porta)) return { ok: false, detalhe: "a porta do banco de teste continua aberta" };
    if (existsSync(path.join(this.pastaDados, "postmaster.pid"))) return { ok: false, detalhe: "o postmaster.pid continua na pasta" };
    return { ok: true, detalhe: "pg_ctl stop, status 3, porta fechada e postmaster.pid ausente" };
  }

  /** Só chamar depois de encerrar() confirmar. Sem confirmação, a pasta fica. */
  remover(): { ok: boolean; detalhe: string } {
    const motivo = motivoParaNaoRemover(this.pasta);
    if (motivo) return { ok: false, detalhe: motivo };
    rmSync(this.pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return existsSync(this.pasta) ? { ok: false, detalhe: "a pasta não foi apagada" } : { ok: true, detalhe: "pasta apagada" };
  }
}
