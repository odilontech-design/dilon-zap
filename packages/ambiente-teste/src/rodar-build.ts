import "./bloquear-rede";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ocultar } from "./config";
import { encerrarAmbiente, log, prepararAmbiente, raizDoPacote, riscoDeExecucao } from "./preparar-ambiente";

/**
 * `next build` do site com o mesmo ambiente local dos testes: banco descartável,
 * variáveis de produção esvaziadas, .env do repositório invisível e rede presa à
 * máquina. O build importa os módulos das rotas, e é por isso que o banco existe.
 *
 * Escreve em apps/web/.next, que não vai para o git (e substitui o cache de
 * desenvolvimento, que o `next dev` refaz sozinho).
 */

const raiz = path.resolve(raizDoPacote, "../..");

async function principal(): Promise<number> {
  const risco = await riscoDeExecucao(false);
  if (risco) {
    log(`Execução recusada: ${risco}. Nada foi executado.`);
    return 1;
  }

  const pacote = await prepararAmbiente({ semente: "site" });
  let codigo = 1;
  try {
    const next = createRequire(import.meta.url).resolve("next/dist/bin/next", { paths: [path.join(raiz, "apps/web")] });
    log("Rodando next build...");
    codigo = await new Promise<number>((resolve) => {
      const filho = spawn(process.execPath, [next, "build"], {
        // O build exige NODE_ENV=production. O resto do ambiente é o mesmo.
        env: { ...pacote.ambiente, NODE_ENV: "production" },
        cwd: path.join(raiz, "apps/web"),
        stdio: ["ignore", "pipe", "pipe"],
      });
      pacote.aoViolar(() => filho.kill());
      filho.stdout.on("data", (d) => process.stdout.write(ocultar(String(d), pacote.segredos)));
      filho.stderr.on("data", (d) => process.stderr.write(ocultar(String(d), pacote.segredos)));
      filho.on("close", (c) => resolve(c ?? 1));
    });
    log(`next build: ${codigo === 0 ? "concluído" : "FALHOU"} (código ${codigo}).`);
  } catch (e) {
    log(`Falha: ${ocultar(e instanceof Error ? e.message : String(e), pacote.segredos)}`);
  } finally {
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
