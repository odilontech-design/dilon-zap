const path = require("node:path");

// Monorepo sem .env por app: carrega o .env da raiz do projeto. next.config.js
// roda antes de qualquer rota/módulo do app, então process.env já está
// populado quando o Prisma Client e o NextAuth forem instanciados.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dilon-zap/db", "@dilon-zap/storage"],
};

module.exports = nextConfig;
