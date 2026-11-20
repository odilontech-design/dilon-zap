const path = require("node:path");

// Monorepo sem .env por app: carrega o da raiz antes de qualquer rota.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { version } = require("../../package.json");

// O Ponto tem segredo e URL próprios (PONTO_*), para a sessão de um produto
// não valer no outro. O NextAuth só lê NEXTAUTH_*, então mapeamos aqui.
if (process.env.PONTO_NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = process.env.PONTO_NEXTAUTH_SECRET;
if (process.env.PONTO_NEXTAUTH_URL !== undefined) process.env.NEXTAUTH_URL = process.env.PONTO_NEXTAUTH_URL;

if (process.env.NEXTAUTH_URL !== undefined) {
  const bruto = process.env.NEXTAUTH_URL.trim();
  if (bruto === "") {
    delete process.env.NEXTAUTH_URL;
  } else {
    try {
      new URL(bruto);
      process.env.NEXTAUTH_URL = bruto;
    } catch {
      throw new Error(
        `PONTO_NEXTAUTH_URL tem um valor inválido: ${JSON.stringify(bruto)}. ` +
          "Use o endereço completo, com https:// na frente.",
      );
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dilon-zap/ponto-db", "@dilon-zap/ponto-core", "@dilon-zap/storage"],
  experimental: {
    // Ver apps/esquadrias/next.config.js: o Prisma carrega a engine por
    // caminho em runtime, e o rastreio precisa partir da raiz do monorepo.
    serverComponentsExternalPackages: ["@prisma-ponto/client"],
    outputFileTracingRoot: path.resolve(__dirname, "../../"),
    serverActions: { bodySizeLimit: "2mb" },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

module.exports = nextConfig;
