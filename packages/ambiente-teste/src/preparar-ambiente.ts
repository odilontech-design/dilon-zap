import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BancoTeste } from "./banco-teste";
import {
  BANCO_TESTE,
  PORTA_SITE,
  PORTA_TUNEL_PRODUCAO,
  VARIAVEL_MARCA,
  VARIAVEL_PASTA_DADOS,
  VARIAVEL_SENHA_USUARIOS,
  montarAmbiente,
  ocultar,
  urlDoBancoDeTeste,
} from "./config";
import { confirmarServidor, validarUrlDeTeste } from "./guarda-banco";
import { portasEmUso } from "./riscos";
import { Sentinela } from "./sentinela";

const executar = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
export const raizDoPacote = path.resolve(aqui, "..");
const raizDoRepositorio = path.resolve(raizDoPacote, "../..");
const schema = path.resolve(raizDoPacote, "../db/prisma/schema.prisma");
const requerer = createRequire(import.meta.url);

export const log = (texto: string) => console.log(`[ambiente-teste] ${texto}`);

/** Motivo para não rodar, ou null. Vem antes de qualquer outra coisa. */
export async function riscoDeExecucao(comSite: boolean): Promise<string | null> {
  if (process.platform !== "win32") return "este ambiente foi preparado para Windows x64";
  const { stdout } = await executar("netstat", ["-ano", "-p", "TCP"]);
  if (portasEmUso(stdout, [PORTA_TUNEL_PRODUCAO]).length) {
    return `porta ${PORTA_TUNEL_PRODUCAO} em uso, provavelmente o túnel de produção. Feche o túnel`;
  }
  if (portasEmUso(stdout, [BANCO_TESTE.porta]).length) return `porta ${BANCO_TESTE.porta} já em uso por outro processo`;
  if (comSite && portasEmUso(stdout, [PORTA_SITE]).length) return `porta ${PORTA_SITE} já em uso por outro processo`;
  return null;
}

/**
 * Gera o cliente Prisma do schema atual. Não conecta a banco nenhum. Roda em
 * pasta neutra para o Prisma não achar o .env da raiz.
 */
export async function gerarCliente(ambiente: NodeJS.ProcessEnv, pasta: string) {
  const cli = requerer.resolve("prisma/build/index.js");
  await executar(process.execPath, [cli, "generate", "--schema", schema], { env: ambiente, cwd: pasta, maxBuffer: 16 * 1024 * 1024 });
}

/** SQL do schema sem conectar a banco nenhum: não há db push nem migration aqui. */
async function sqlDoSchema(ambiente: NodeJS.ProcessEnv, pasta: string): Promise<string> {
  const cli = requerer.resolve("prisma/build/index.js");
  const { stdout } = await executar(
    process.execPath,
    [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", schema, "--script"],
    { env: ambiente, cwd: pasta, maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout;
}

const ARQUIVO_GUARDA = path.join(aqui, "guarda-processo.cjs").replace(/\\/g, "/");

export type Ambiente = {
  banco: BancoTeste;
  sentinela: Sentinela;
  ambiente: NodeJS.ProcessEnv;
  segredos: string[];
  senhaUsuarios: string;
  /** Interrompe o que estiver rodando, chamado quando a sentinela acusa algo. */
  aoViolar: (acao: () => void) => void;
  violou: () => boolean;
};

export async function prepararAmbiente(opcoes: { semente: "site" | "testes" }): Promise<Ambiente> {
  const banco = new BancoTeste();
  const senhaUsuarios = randomBytes(12).toString("hex");
  const segredoSessao = randomBytes(32).toString("hex");
  const segredos = [banco.senha, senhaUsuarios, segredoSessao];
  const url = urlDoBancoDeTeste(banco.senha);
  const veredito = validarUrlDeTeste(url);
  if (!veredito.ok) throw new Error(`URL recusada: ${veredito.motivo}`);

  const ambiente = montarAmbiente(process.env, {
    DATABASE_URL: url,
    [VARIAVEL_MARCA]: banco.marca,
    [VARIAVEL_PASTA_DADOS]: banco.pastaDados,
    [VARIAVEL_SENHA_USUARIOS]: senhaUsuarios,
    DILON_TESTE_PORTA_SITE: String(PORTA_SITE),
    NEXTAUTH_URL: `http://${BANCO_TESTE.host}:${PORTA_SITE}`,
    NEXTAUTH_SECRET: segredoSessao,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: `--require "${ARQUIVO_GUARDA}"`,
  });
  // O orquestrador e o Postgres também não herdam nada além disso.
  for (const nome of Object.keys(process.env)) delete process.env[nome];
  Object.assign(process.env, ambiente);

  let violou = false;
  let acaoDeViolacao: (() => void) | null = null;
  const sentinela = new Sentinela((v) => {
    violou = true;
    log(`VIOLAÇÃO: ${v}. Interrompendo.`);
    acaoDeViolacao?.();
  }, [BANCO_TESTE.porta, PORTA_SITE]);

  const pacote: Ambiente = {
    banco,
    sentinela,
    ambiente,
    segredos,
    senhaUsuarios,
    aoViolar: (acao) => {
      acaoDeViolacao = acao;
    },
    violou: () => violou,
  };

  try {
    await sentinela.iniciar(ambiente, process.pid);
    log("Sentinela de conexões ativa.");

    await gerarCliente(ambiente, banco.pasta);
    log("Cliente Prisma gerado sem conectar a banco.");

    await banco.iniciar();
    await banco.gravarMarca();

    const c = banco.cliente();
    await c.connect();
    try {
      const confirmacao = await confirmarServidor(async (sql) => (await c.query(sql)).rows, {
        marca: banco.marca,
        pastaDados: banco.pastaDados,
      });
      if (!confirmacao.ok) throw new Error(`servidor recusado: ${confirmacao.motivo}`);
      log(`Servidor local e marca ${banco.marca.slice(0, 8)}... confirmados antes da primeira escrita.`);
      await c.query(await sqlDoSchema(ambiente, banco.pasta));
      log("Schema atual aplicado no banco local, sem db push nem migration.");
    } finally {
      await c.end();
    }

    // Só agora o Prisma pode ser carregado: precisa da DATABASE_URL acima.
    const { semear } = await import("./semente");
    await semear(senhaUsuarios, { outraEmpresaComSdr: opcoes.semente === "testes", marca: banco.marca, pastaDados: banco.pastaDados });
    log("Dados fictícios de teste criados.");
    return pacote;
  } catch (e) {
    await encerrarAmbiente(pacote);
    throw e;
  }
}

/** Sobe o Next só neste computador, com o ambiente acima e a guarda de processo. */
export async function subirSite(pacote: Ambiente, aoEscrever: (texto: string) => void): Promise<ChildProcess> {
  const next = requerer.resolve("next/dist/bin/next", { paths: [path.join(raizDoRepositorio, "apps/web")] });
  const site = spawn(process.execPath, [next, "dev", "-H", BANCO_TESTE.host, "-p", String(PORTA_SITE)], {
    env: pacote.ambiente,
    cwd: path.join(raizDoRepositorio, "apps/web"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  site.stdout.on("data", (d) => aoEscrever(ocultar(String(d), pacote.segredos)));
  site.stderr.on("data", (d) => aoEscrever(ocultar(String(d), pacote.segredos)));

  const limite = Date.now() + 240_000;
  while (Date.now() < limite) {
    if (site.exitCode !== null) throw new Error("o site encerrou antes de responder");
    try {
      const r = await fetch(`http://${BANCO_TESTE.host}:${PORTA_SITE}/api/auth/csrf`);
      if (r.ok) return site;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error("o site não respondeu a tempo");
}

/**
 * Sobe o apps/sdr-worker de verdade, no mesmo ambiente local do site (banco de
 * teste, variáveis esvaziadas, guarda de processo). É o que faz as importações
 * da tela andarem. Encerrar com encerrarSite(), que mata a árvore de processos.
 */
export function subirWorkerSdr(pacote: Ambiente, aoEscrever: (texto: string) => void): ChildProcess {
  const tsx = requerer.resolve("tsx");
  const worker = spawn(process.execPath, ["--import", new URL(`file:///${tsx.replace(/\\/g, "/")}`).href, "src/index.ts"], {
    env: { ...pacote.ambiente, SDR_INTERVALO_MS: "1000" },
    cwd: path.join(raizDoRepositorio, "apps/sdr-worker"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.stdout.on("data", (d) => aoEscrever(ocultar(String(d), pacote.segredos)));
  worker.stderr.on("data", (d) => aoEscrever(ocultar(String(d), pacote.segredos)));
  return worker;
}

/** O Next abre processos filhos, e child.kill no Windows só alcança o primeiro. */
export async function encerrarSite(site: ChildProcess | null) {
  if (!site?.pid || site.exitCode !== null) return;
  await executar("taskkill", ["/pid", String(site.pid), "/t", "/f"]).catch(() => undefined);
}

export function registrarAcessoLocal(pacote: Ambiente) {
  const arquivo = path.join(pacote.banco.pasta, "acesso-local.txt");
  writeFileSync(
    arquivo,
    [
      "Acesso ao site local do SDR. Dados fictícios, apagados ao encerrar.",
      `Senha de todos os usuários: ${pacote.senhaUsuarios}`,
      "Responsável, com SDR: dono@dilontech.teste",
      "Financeiro, só leitura: financeiro@dilontech.teste",
      "Atendente, sem acesso: atendente@dilontech.teste",
      "Outra empresa, sem SDR: dono@externa.teste",
      "",
    ].join("\n")
  );
  return arquivo;
}

export async function encerrarAmbiente(pacote: Ambiente): Promise<number> {
  let codigo = 0;
  await new Promise((r) => setTimeout(r, 500));
  pacote.sentinela.parar();
  const { resumo } = pacote.sentinela;
  log(
    `Sentinela: ${resumo.leituras} leituras, ${resumo.conexoesAoBancoDeTeste} conexões vistas ao banco de teste, ` +
      `${resumo.pidsVistosNoBanco} processos, ${resumo.violacoes.length} violações.`
  );
  if (pacote.violou()) codigo = 1;

  try {
    const { prisma } = await import("@dilon-zap/db");
    await prisma.$disconnect();
  } catch {
    // o cliente pode não ter sido carregado
  }

  const fim = await pacote.banco.encerrar(pacote.ambiente);
  log(`Encerramento do Postgres: ${fim.ok ? "confirmado" : "NÃO confirmado"} (${fim.detalhe}).`);
  if (fim.ok) {
    const remocao = pacote.banco.remover();
    log(`Pasta temporária: ${remocao.detalhe}.`);
    if (!remocao.ok) codigo = 1;
  } else {
    log(`Pasta temporária mantida: ${pacote.banco.pasta}`);
    codigo = 1;
  }
  return codigo;
}
