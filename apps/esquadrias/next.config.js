const path = require("node:path");

// Mesmo padrão do apps/web: monorepo sem .env por app, então carrega o da
// raiz antes de qualquer rota tocar em process.env.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { version } = require("../../package.json");

/*
 * Sanidade do NEXTAUTH_URL, antes de qualquer coisa.
 *
 * Criar a variável no painel e deixar o valor em branco é fácil de fazer e
 * quase impossível de diagnosticar: o SessionProvider fica no layout raiz, o
 * que faz TODA página depender dessa URL na hora do build, e o erro que sai é
 * um "TypeError: Invalid URL" sem dizer qual variável está errada — nem que
 * uma variável está envolvida.
 *
 * String vazia não é um valor: tratamos como ausente e avisamos. Ausente é um
 * estado válido — na Vercel o NextAuth deduz a URL do deploy sozinho, e o app
 * sobe funcionando no domínio .vercel.app. Já um valor PREENCHIDO e inválido
 * (um "meusite.com.br" sem https://) é engano de digitação e vale parar o
 * build, agora com uma mensagem que diz o que consertar.
 */
if (process.env.NEXTAUTH_URL !== undefined) {
  const bruto = process.env.NEXTAUTH_URL.trim();

  if (bruto === "") {
    console.warn(
      "[esquadrias] NEXTAUTH_URL está definida mas vazia — ignorando. " +
        "Na Vercel o login vai usar o domínio do próprio deploy. " +
        "Preencha com o endereço completo (https://...) quando o domínio estiver pronto.",
    );
    delete process.env.NEXTAUTH_URL;
  } else {
    try {
      new URL(bruto);
      process.env.NEXTAUTH_URL = bruto;
    } catch {
      throw new Error(
        `NEXTAUTH_URL tem um valor inválido: ${JSON.stringify(bruto)}. ` +
          "Precisa ser o endereço completo, com https:// na frente — " +
          "por exemplo https://esquadrias.dilontech.com.br",
      );
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dilon-zap/erp-db", "@dilon-zap/esquadrias-core"],

  // Os dois ajustes abaixo existem por causa do deploy serverless (Vercel) em
  // monorepo. Em container eles são inofensivos.
  experimental: {
    // O Prisma Client carrega o binário da query engine por caminho, em
    // runtime. Empacotado pelo bundler, esse caminho deixa de existir e a
    // primeira query quebra em produção — no build local passa, porque lá o
    // arquivo está no lugar. Marcar como externo faz o Node exigir do
    // node_modules, como o Prisma espera.
    serverComponentsExternalPackages: ["@prisma-erp/client"],
    // O rastreio de arquivos do Next parte do diretório do app. Num monorepo
    // com workspaces hoisted, as dependências moram no node_modules da RAIZ e
    // ficariam de fora do pacote publicado.
    outputFileTracingRoot: path.resolve(__dirname, "../../"),
  },

  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

module.exports = nextConfig;
