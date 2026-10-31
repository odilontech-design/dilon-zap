/**
 * Identidade do banco de teste e variáveis permitidas nos processos de teste.
 *
 * Sem .env de propósito: um arquivo de configuração é onde alguém acabaria
 * colando a URL de produção. A senha é sorteada a cada execução e não fica em
 * lugar nenhum depois que o banco é apagado.
 */

export const BANCO_TESTE = {
  host: "127.0.0.1",
  porta: 55432,
  banco: "dilonzap_test",
  usuario: "dilon_teste",
} as const;

export const PREFIXO_PASTA = "dilon-zap-teste-";
export const ARQUIVO_DA_PASTA = ".dilon-zap-teste";
export const PORTA_TUNEL_PRODUCAO = 5433;
export const VARIAVEL_MARCA = "DILON_TESTE_MARCA";
export const VARIAVEL_PASTA_DADOS = "DILON_TESTE_PASTA_DADOS";

export function urlDoBancoDeTeste(senha: string, banco: string = BANCO_TESTE.banco) {
  const { usuario, host, porta } = BANCO_TESTE;
  return `postgresql://${usuario}:${encodeURIComponent(senha)}@${host}:${porta}/${banco}`;
}

/** Só o necessário para o Windows e o Node funcionarem. O resto não é herdado. */
const HERDADAS = [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "WINDIR",
  "SystemDrive",
  "ComSpec",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "CommonProgramFiles",
  "PSModulePath",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
];

/**
 * Ficam definidas e vazias: o dotenv não sobrescreve variável que já existe,
 * então um `.env` carregado por engano não devolve estes segredos ao processo.
 */
export const VARIAVEIS_ESVAZIADAS = [
  "DIRECT_URL",
  "ESQUADRIAS_DATABASE_URL",
  "NEXTAUTH_SECRET",
  "WORKER_INTERNAL_URL",
  "WORKER_INTERNAL_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "MP_ACCESS_TOKEN",
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
];

export function montarAmbiente(origem: NodeJS.ProcessEnv, extras: Record<string, string>): NodeJS.ProcessEnv {
  const ambiente: NodeJS.ProcessEnv = {};
  for (const nome of HERDADAS) {
    if (origem[nome] !== undefined) ambiente[nome] = origem[nome];
  }
  for (const nome of VARIAVEIS_ESVAZIADAS) ambiente[nome] = "";
  return {
    ...ambiente,
    NODE_ENV: "test",
    // Sem verificação de atualização do Prisma, que sairia para a internet.
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    ...extras,
  };
}

/** Tira URLs de banco e valores sensíveis de tudo que vai para o terminal. */
export function ocultar(texto: string, segredos: string[] = []): string {
  let limpo = texto.replace(/postgres(?:ql)?:\/\/\S+/gi, "[url oculta]");
  for (const segredo of segredos) {
    if (segredo) limpo = limpo.split(segredo).join("[oculto]");
  }
  return limpo;
}
