import path from "node:path";
import { realpathSync } from "node:fs";
import { BANCO_TESTE } from "./config";

/**
 * A guarda que decide se um banco é o de teste. Duas conferências:
 *
 * 1. A URL, antes de abrir qualquer conexão.
 * 2. O servidor, depois de conectar e antes de qualquer escrita. Pega o caso
 *    que a URL não vê: um túnel para outro servidor usando a mesma porta.
 *
 * Os motivos de recusa nunca repetem a URL recebida.
 */

export type Veredito = { ok: true } | { ok: false; motivo: string };

const recusa = (motivo: string): Veredito => ({ ok: false, motivo });

export function validarUrlDeTeste(url: string | undefined): Veredito {
  if (!url) return recusa("URL ausente");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return recusa("URL inválida");
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return recusa("protocolo inesperado");
  if (u.hostname !== BANCO_TESTE.host) return recusa("host diferente do banco de teste");
  if (Number(u.port) !== BANCO_TESTE.porta) return recusa("porta diferente do banco de teste");
  if (u.pathname !== `/${BANCO_TESTE.banco}`) return recusa("nome de banco diferente do banco de teste");
  if (decodeURIComponent(u.username) !== BANCO_TESTE.usuario) return recusa("usuário diferente do banco de teste");
  // host= e parecidos desviam a conexão sem mudar o endereço visível na URL.
  for (const chave of u.searchParams.keys()) {
    if (chave !== "schema") return recusa("parâmetro de conexão não permitido");
  }
  return { ok: true };
}

export function normalizarPasta(pasta: string): string {
  let real = pasta;
  try {
    // Expande nomes curtos do Windows (RUNNER~1) antes de comparar.
    real = realpathSync.native(pasta);
  } catch {
    real = path.resolve(pasta);
  }
  return real.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export type Consultar = (sql: string) => Promise<Record<string, unknown>[]>;

export type IdentidadeEsperada = { marca: string; pastaDados: string };

/**
 * Confere o que o próprio servidor diz sobre si. A marca é um UUID sorteado a
 * cada execução e gravado em uma tabela só deste banco, então não existe em
 * nenhum outro servidor.
 */
export async function confirmarServidor(consultar: Consultar, esperado: IdentidadeEsperada): Promise<Veredito> {
  let info: Record<string, unknown> | undefined;
  try {
    [info] = await consultar(
      `select current_database()::text as banco,
              current_user::text as usuario,
              host(inet_server_addr())::text as host,
              inet_server_port()::int as porta,
              current_setting('data_directory')::text as pasta`
    );
  } catch {
    return recusa("não foi possível ler a identidade do servidor");
  }
  if (!info) return recusa("o servidor não respondeu à identificação");
  if (info.banco !== BANCO_TESTE.banco) return recusa("o servidor informou outro banco");
  if (info.usuario !== BANCO_TESTE.usuario) return recusa("o servidor informou outro usuário");
  if (info.host !== BANCO_TESTE.host) return recusa("o servidor informou outro endereço");
  if (Number(info.porta) !== BANCO_TESTE.porta) return recusa("o servidor informou outra porta");
  if (normalizarPasta(String(info.pasta)) !== normalizarPasta(esperado.pastaDados)) {
    return recusa("o servidor usa outra pasta de dados");
  }

  let marcas: Record<string, unknown>[];
  try {
    marcas = await consultar(`select valor::text as valor from ambiente_teste.marca`);
  } catch {
    return recusa("o banco não tem a marca do ambiente de teste");
  }
  if (marcas.length !== 1 || marcas[0].valor !== esperado.marca) {
    return recusa("a marca do banco não confere com esta execução");
  }
  return { ok: true };
}
