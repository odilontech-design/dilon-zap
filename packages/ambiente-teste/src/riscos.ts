import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ARQUIVO_DA_PASTA, PREFIXO_PASTA } from "./config";
import { normalizarPasta } from "./guarda-banco";

/**
 * Regras puras do ambiente. Ficam longe de banco-teste.ts de propósito: quem
 * importa o embedded-postgres ganha um gancho de saída que troca o código do
 * processo por 0, e um teste reprovado pareceria aprovado.
 */

/** Portas ocupadas a partir da saída do netstat. */
export function portasEmUso(saidaNetstat: string, portas: number[]): number[] {
  return portas.filter((p) => saidaNetstat.split("\n").some((l) => /LISTENING/i.test(l) && new RegExp(`:${p}\\s`).test(l)));
}

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

/**
 * Os testes só valem como aprovados com tudo concordando: código 0, a contagem
 * do relatório presente, nenhum reprovado ou cancelado. O código sozinho não
 * basta, porque um gancho de saída de biblioteca pode trocá-lo.
 */
export function testesAprovados(codigo: number, relatorio: string): boolean {
  const total = (nome: string) => {
    const m = relatorio.match(new RegExp(`^. ${nome} (\\d+)`, "m"));
    return m ? Number(m[1]) : null;
  };
  const [passaram, falharam, cancelados] = [total("pass"), total("fail"), total("cancelled")];
  return codigo === 0 && passaram !== null && passaram > 0 && falharam === 0 && cancelados === 0;
}
