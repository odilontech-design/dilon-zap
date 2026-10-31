import "./bloquear-rede";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BancoTeste } from "./banco-teste";
import {
  BANCO_TESTE,
  PORTA_TUNEL_PRODUCAO,
  VARIAVEL_MARCA,
  VARIAVEL_PASTA_DADOS,
  montarAmbiente,
  ocultar,
  urlDoBancoDeTeste,
} from "./config";
import { confirmarServidor, validarUrlDeTeste } from "./guarda-banco";
import { Sentinela } from "./sentinela";

/**
 * Único jeito de rodar os testes. Não lê nenhum .env e não aceita URL de fora:
 * o endereço do banco é o deste pacote, e o Postgres nasce e morre aqui.
 */

const executar = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizDoPacote = path.resolve(aqui, "..");
const schema = path.resolve(raizDoPacote, "../db/prisma/schema.prisma");
const log = (texto: string) => console.log(`[ambiente-teste] ${texto}`);

async function portaEmUso(porta: number): Promise<boolean> {
  const { stdout } = await executar("netstat", ["-ano", "-p", "TCP"]);
  return stdout.split("\n").some((l) => /LISTENING/i.test(l) && new RegExp(`:${porta}\\s`).test(l));
}

/**
 * Gera o SQL do schema sem conectar a banco nenhum (--from-empty e
 * --to-schema-datamodel). Assim não há `db push` nem migration nesta etapa. Roda
 * na pasta temporária para o Prisma não achar o .env da raiz.
 */
async function sqlDoSchema(ambiente: NodeJS.ProcessEnv, pasta: string): Promise<string> {
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const { stdout } = await executar(
    process.execPath,
    [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", schema, "--script"],
    { env: ambiente, cwd: pasta, maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout;
}

let testesEmAndamento: ChildProcess | null = null;

async function rodarTestes(ambiente: NodeJS.ProcessEnv, segredos: string[]): Promise<number> {
  const tsx = createRequire(import.meta.url).resolve("tsx");
  return new Promise((resolve) => {
    const filho = spawn(
      process.execPath,
      [
        "--import",
        new URL(`file:///${tsx.replace(/\\/g, "/")}`).href,
        "--import",
        new URL(`file:///${path.join(aqui, "bloquear-rede.ts").replace(/\\/g, "/")}`).href,
        "--test",
        "--test-isolation=none",
        "--test-reporter=spec",
        "test/isolamento.test.ts",
      ],
      { env: ambiente, cwd: raizDoPacote, stdio: ["ignore", "pipe", "pipe"] }
    );
    testesEmAndamento = filho;
    filho.stdout.on("data", (d) => process.stdout.write(ocultar(String(d), segredos)));
    filho.stderr.on("data", (d) => process.stderr.write(ocultar(String(d), segredos)));
    filho.on("close", (codigo) => resolve(codigo ?? 1));
  });
}

async function coletarEvidencias(banco: BancoTeste) {
  const c = banco.cliente();
  await c.connect();
  try {
    const { rows: [identidade] } = await c.query(
      `select current_database()::text as banco, host(inet_server_addr()) as host, inet_server_port() as porta,
              split_part(version(), ' ', 2) as versao,
              (select count(*)::int from pg_tables where schemaname = 'public') as tabelas,
              (select count(*)::int from "Tenant") as empresas,
              (select count(*)::int from "Contact") as contatos`
    );
    const { rows: hba } = await c.query(
      `select type, address, netmask from pg_hba_file_rules where type <> 'local' and error is null`
    );
    return { identidade, hba };
  } finally {
    await c.end();
  }
}

async function principal(): Promise<number> {
  if (process.platform !== "win32") {
    log("Este ambiente foi preparado para Windows x64. Nada foi executado.");
    return 1;
  }
  // Túnel aberto aumenta o risco de um comando chegar à produção.
  if (await portaEmUso(PORTA_TUNEL_PRODUCAO)) {
    log(`Porta ${PORTA_TUNEL_PRODUCAO} em uso, provavelmente o túnel de produção. Feche e rode de novo. Nada foi executado.`);
    return 1;
  }
  if (await portaEmUso(BANCO_TESTE.porta)) {
    log(`Porta ${BANCO_TESTE.porta} já em uso por outro processo. Nada foi executado.`);
    return 1;
  }

  const banco = new BancoTeste();
  const segredos = [banco.senha];
  const url = urlDoBancoDeTeste(banco.senha);
  const veredito = validarUrlDeTeste(url);
  if (!veredito.ok) {
    log(`URL recusada: ${veredito.motivo}`);
    return 1;
  }

  const ambiente = montarAmbiente(process.env, {
    DATABASE_URL: url,
    [VARIAVEL_MARCA]: banco.marca,
    [VARIAVEL_PASTA_DADOS]: banco.pastaDados,
  });
  // O próprio orquestrador e o Postgres também não herdam nada além disso.
  for (const nome of Object.keys(process.env)) delete process.env[nome];
  Object.assign(process.env, ambiente);

  let violou = false;
  const sentinela = new Sentinela((v) => {
    violou = true;
    log(`VIOLAÇÃO: ${v}. Interrompendo.`);
    // Para os testes na hora. O encerramento do banco segue no finally.
    testesEmAndamento?.kill();
  });

  let codigo = 1;
  try {
    await sentinela.iniciar(ambiente, process.pid);
    log("Sentinela de conexões ativa.");

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
      log("Servidor confirmado antes da primeira escrita de schema.");
      await c.query(await sqlDoSchema(ambiente, banco.pasta));
      log("Schema atual aplicado no banco local, sem db push nem migration.");
    } finally {
      await c.end();
    }

    codigo = await rodarTestes(ambiente, segredos);

    const { identidade, hba } = await coletarEvidencias(banco);
    log("Evidências do banco usado:");
    log(`  banco ${identidade.banco} em ${identidade.host}:${identidade.porta}, Postgres ${identidade.versao}`);
    log(`  marca desta execução: ${banco.marca.slice(0, 8)}...`);
    log(`  tabelas ${identidade.tabelas}, empresas ${identidade.empresas}, contatos ${identidade.contatos}`);
    log(`  regras de acesso por rede: ${hba.map((r: { type: string; address: string }) => `${r.type} ${r.address}`).join(", ")}`);
    log(`  origem das conexões (log do Postgres): ${[...banco.hostsConectados].map(([h, n]) => `${h}=${n}`).join(", ")}`);
  } catch (e) {
    log(`Falha: ${ocultar(e instanceof Error ? e.message : String(e), segredos)}`);
    codigo = 1;
  } finally {
    // Dá tempo de a última leitura pegar as conexões recém-encerradas.
    await new Promise((r) => setTimeout(r, 500));
    sentinela.parar();
    const { resumo } = sentinela;
    log(
      `Sentinela: ${resumo.leituras} leituras, ${resumo.conexoesAoBancoDeTeste} conexões vistas ao banco de teste, ` +
        `${resumo.pidsVistosNoBanco} processos, ${resumo.violacoes.length} violações.`
    );
    if (resumo.leituras === 0 || resumo.conexoesAoBancoDeTeste === 0) {
      log("A sentinela não observou o banco de teste, então não vale como prova.");
      codigo = 1;
    }
    if (violou) codigo = 1;
    // O processo de teste é o que carrega o motor nativo do Prisma. Se ele não
    // apareceu, a sentinela não prova nada sobre o motor.
    const pidTestes = testesEmAndamento?.pid;
    if (pidTestes && sentinela.viuNoBanco(pidTestes)) {
      log("Sentinela: conexão do motor do Prisma observada no sistema operacional, só com o banco de teste.");
    } else {
      log("A sentinela não observou o motor do Prisma, então não vale como prova.");
      codigo = 1;
    }

    const fim = await banco.encerrar(ambiente);
    log(`Encerramento do Postgres: ${fim.ok ? "confirmado" : "NÃO confirmado"} (${fim.detalhe}).`);
    if (fim.ok) {
      const remocao = banco.remover();
      log(`Pasta temporária: ${remocao.detalhe}.`);
      if (!remocao.ok) codigo = 1;
    } else {
      log(`Pasta temporária mantida: ${banco.pasta}`);
      codigo = 1;
    }
  }
  return codigo;
}

// Se o processo sair antes do fim, por exemplo com algo esperando para sempre e
// o loop de eventos vazio, o Node devolveria 0. Isso não pode parecer sucesso.
let concluiu = false;
process.on("exit", () => {
  if (concluiu) return;
  console.error("[ambiente-teste] Saída antes do fim: o encerramento não foi confirmado.");
  process.exitCode = 1;
});

principal()
  .then((codigo) => {
    concluiu = true;
    process.exit(codigo);
  })
  .catch((e) => {
    log(`Falha inesperada: ${ocultar(e instanceof Error ? e.message : String(e))}`);
    concluiu = true;
    process.exit(1);
  });
