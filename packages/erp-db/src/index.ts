import { PrismaClient } from "@prisma-erp/client";

const MENSAGEM_SEM_URL =
  "ESQUADRIAS_DATABASE_URL não está definida. Este é o banco do SaaS de esquadrias, " +
  "separado do DATABASE_URL do Dilon Zap — se você copiou a string do Neon/Supabase, " +
  "renomeie a variável. Ver docs/deploy-vercel-neon.md.";

const globalParaPrisma = globalThis as unknown as { prismaErp?: PrismaClient };

let instancia: PrismaClient | undefined;

/**
 * Cria (uma vez) o client do banco de esquadrias.
 *
 * A conferência da variável fica AQUI, e não no topo do módulo, por causa do
 * `next build`: ele importa toda rota para coletar os dados de página, então
 * um throw na importação derruba a compilação inteira quando o ambiente de
 * build não tem a connection string — mesmo que o ambiente de execução tenha.
 * Validando no primeiro uso, o build passa e quem esqueceu a variável recebe
 * a mensagem na primeira consulta, que é quando o problema realmente existe.
 *
 * O singleton fica preso no globalThis fora de produção porque o hot-reload
 * do Next recarrega o módulo a cada alteração de arquivo — sem isso, o pool
 * de conexões cresce até o Postgres recusar novas em plena sessão de
 * desenvolvimento.
 */
function obterClient(): PrismaClient {
  if (instancia) return instancia;

  if (!process.env.ESQUADRIAS_DATABASE_URL) throw new Error(MENSAGEM_SEM_URL);

  instancia =
    globalParaPrisma.prismaErp ??
    new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

  if (process.env.NODE_ENV !== "production") globalParaPrisma.prismaErp = instancia;

  return instancia;
}

/**
 * Fachada preguiçosa: `prisma.cliente.findMany()` continua igual em quem usa,
 * mas o client só nasce no primeiro acesso a uma propriedade.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const cliente = obterClient();
    const valor = Reflect.get(cliente, propriedade, cliente);
    // Métodos como `$transaction` perdem o `this` ao serem devolvidos soltos.
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
});

export * from "@prisma-erp/client";
