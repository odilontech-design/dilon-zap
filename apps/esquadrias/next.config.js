const path = require("node:path");

// Mesmo padrão do apps/web: monorepo sem .env por app, então carrega o da
// raiz antes de qualquer rota tocar em process.env.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { version } = require("../../package.json");

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
