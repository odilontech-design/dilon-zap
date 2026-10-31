import "./bloquear-rede";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { BANCO_TESTE, PORTA_SITE, ocultar } from "./config";
import { encerrarAmbiente, encerrarSite, log, prepararAmbiente, registrarAcessoLocal, riscoDeExecucao, subirSite, subirWorkerSdr } from "./preparar-ambiente";

/**
 * Sobe o site só com o banco local, para ver as telas no navegador. O banco é
 * descartável: nasce vazio a cada execução e some ao encerrar.
 *
 * Para encerrar: Ctrl+C, ou criar um arquivo chamado "parar" na pasta temporária
 * informada. No Windows, matar o processo por fora não dá chance de limpar.
 */

async function principal(): Promise<number> {
  const risco = await riscoDeExecucao(true);
  if (risco) {
    log(`Execução recusada: ${risco}. Nada foi executado.`);
    return 1;
  }

  const pacote = await prepararAmbiente({ semente: "site" });
  // O pacote embedded-postgres registra um encerramento que força o fim do
  // Postgres. O daqui espera o banco fechar antes de apagar a pasta.
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");

  let site: ChildProcess | null = null;
  let worker: ChildProcess | null = null;
  let codigo = 0;
  try {
    const parou = new Promise<void>((resolve) => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
      const arquivo = path.join(pacote.banco.pasta, "parar");
      const vigia = setInterval(() => {
        if (existsSync(arquivo) || pacote.violou() || (site && site.exitCode !== null)) {
          clearInterval(vigia);
          resolve();
        }
      }, 1_000);
    });
    pacote.aoViolar(() => {
      void encerrarSite(site);
      void encerrarSite(worker);
    });

    site = await subirSite(pacote, (t) => process.stdout.write(t));
    // O worker do SDR sobe junto, para as importações feitas na tela andarem.
    worker = subirWorkerSdr(pacote, (t) => process.stdout.write(t));
    log(`Site local: http://${BANCO_TESTE.host}:${PORTA_SITE}, com o worker do SDR`);
    log(`Usuários fictícios e senha: ${registrarAcessoLocal(pacote)}`);
    log(`Para encerrar: Ctrl+C, ou crie o arquivo ${path.join(pacote.banco.pasta, "parar")}`);
    await parou;
    log("Encerrando.");
  } catch (e) {
    log(`Falha: ${ocultar(e instanceof Error ? e.message : String(e), pacote.segredos)}`);
    codigo = 1;
  } finally {
    await encerrarSite(worker);
    await encerrarSite(site);
    if ((await encerrarAmbiente(pacote)) !== 0) codigo = 1;
  }
  return codigo;
}

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
