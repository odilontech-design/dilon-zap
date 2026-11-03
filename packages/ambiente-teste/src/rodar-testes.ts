import "./bloquear-rede";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ocultar } from "./config";
import { testesAprovados } from "./riscos";
import { encerrarAmbiente, encerrarSite, log, prepararAmbiente, raizDoPacote, riscoDeExecucao, subirSite, type Ambiente } from "./preparar-ambiente";

/**
 * Único jeito de rodar os testes. Não lê nenhum .env e não aceita URL de fora:
 * o endereço do banco é o deste pacote, e o Postgres nasce e morre aqui.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
let testes: ChildProcess | null = null;

function rodarTestes(pacote: Ambiente): Promise<number> {
  const tsx = createRequire(import.meta.url).resolve("tsx");
  const paraUrl = (p: string) => new URL(`file:///${p.replace(/\\/g, "/")}`).href;
  return new Promise((resolve) => {
    testes = spawn(
      process.execPath,
      [
        "--import",
        paraUrl(tsx),
        "--import",
        paraUrl(path.join(aqui, "bloquear-rede.ts")),
        "--test",
        "--test-isolation=none",
        "--test-timeout=180000",
        "--test-reporter=spec",
        "test/isolamento.test.ts",
        "test/sdr.test.ts",
        "test/csv-normalizacao.test.ts",
        "test/importacao.test.ts",
        "test/lista-painel.test.ts",
        "test/ia.test.ts",
        "test/comercial.test.ts",
        "test/canais.test.ts",
        "test/fila-diaria.test.ts",
        "test/compatibilidade-producao.test.ts",
      ],
      { env: pacote.ambiente, cwd: raizDoPacote, stdio: ["ignore", "pipe", "pipe"] }
    );
    let relatorio = "";
    testes.stdout!.on("data", (d) => {
      const texto = ocultar(String(d), pacote.segredos);
      relatorio += texto;
      process.stdout.write(texto);
    });
    testes.stderr!.on("data", (d) => process.stderr.write(ocultar(String(d), pacote.segredos)));
    testes.on("close", (codigo) => {
      const aprovados = testesAprovados(codigo ?? 1, relatorio);
      log(`Testes: ${aprovados ? "aprovados" : "NÃO aprovados"} (código de saída ${codigo}).`);
      resolve(aprovados ? 0 : 1);
    });
  });
}

async function evidencias(pacote: Ambiente) {
  const c = pacote.banco.cliente();
  await c.connect();
  try {
    const { rows: [i] } = await c.query(
      `select current_database()::text as banco, host(inet_server_addr()) as host, inet_server_port() as porta,
              split_part(version(), ' ', 2) as versao,
              current_setting('TimeZone') as fuso,
              (select count(*)::int from pg_tables where schemaname = 'public') as tabelas,
              (select count(*)::int from "Tenant") as empresas,
              (select count(*)::int from "SdrIcp") as perfis,
              (select count(*)::int from "SdrCampanha") as campanhas,
              (select count(*)::int from "SdrEmpresa") as empresas_sdr,
              (select count(*)::int from "SdrProspecto") as prospectos,
              (select count(*)::int from "SdrImportacao") as importacoes,
              (select count(*)::int from "SdrTrabalho") as trabalhos,
              (select count(*)::int from "Contact") as contatos,
              (select count(*)::int from "Conversation") as conversas,
              (select count(*)::int from "Message") as mensagens,
              (select count(*)::int from "ScheduledMessage") as agendadas,
              (select count(*)::int from "TenantRecurso" where recurso = 'SDR' and ativo) as empresas_com_sdr`
    );
    log("Evidências do banco usado:");
    log(`  banco ${i.banco} em ${i.host}:${i.porta}, Postgres ${i.versao}, fuso do servidor ${i.fuso}`);
    log(`  marca desta execução: ${pacote.banco.marca.slice(0, 8)}...`);
    log(`  tabelas ${i.tabelas}, empresas ${i.empresas}, com SDR ${i.empresas_com_sdr}, perfis ${i.perfis}, campanhas ${i.campanhas}`);
    log(`  SDR: empresas ${i.empresas_sdr}, prospectos ${i.prospectos}, importações ${i.importacoes}, trabalhos registrados ${i.trabalhos}`);
    log(`  CRM e WhatsApp: contatos ${i.contatos}, conversas ${i.conversas}, mensagens ${i.mensagens}, agendadas ${i.agendadas}`);
    log(`  origem das conexões (log do Postgres): ${[...pacote.banco.hostsConectados].map(([h, n]) => `${h}=${n}`).join(", ")}`);
  } finally {
    await c.end();
  }
}

async function principal(): Promise<number> {
  const risco = await riscoDeExecucao(true);
  if (risco) {
    log(`Execução recusada: ${risco}. Nada foi executado.`);
    return 1;
  }

  const pacote = await prepararAmbiente({ semente: "testes" });
  let site: ChildProcess | null = null;
  let codigo = 1;
  try {
    pacote.aoViolar(() => {
      testes?.kill();
      void encerrarSite(site);
    });
    const saida: string[] = [];
    site = await subirSite(pacote, (t) => {
      saida.push(t);
      if (saida.length > 40) saida.shift();
    });
    log("Site local no ar, com a guarda de processo.");

    codigo = await rodarTestes(pacote);
    if (codigo !== 0 && saida.length) log(`Últimas linhas do site:\n${saida.join("")}`);

    await evidencias(pacote);

    // O processo de teste carrega o motor nativo do Prisma. Sem vê-lo, a
    // sentinela não prova nada sobre o motor.
    if (testes?.pid && pacote.sentinela.viuNoBanco(testes.pid)) {
      log("Sentinela: conexão do motor do Prisma observada no sistema operacional, só com o banco de teste.");
    } else {
      log("A sentinela não observou o motor do Prisma, então não vale como prova.");
      codigo = 1;
    }
  } catch (e) {
    log(`Falha: ${ocultar(e instanceof Error ? e.message : String(e), pacote.segredos)}`);
    codigo = 1;
  } finally {
    await encerrarSite(site);
    if ((await encerrarAmbiente(pacote)) !== 0) codigo = 1;
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
