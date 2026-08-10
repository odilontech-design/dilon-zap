const path = require("node:path");

// Monorepo sem .env por app: carrega o .env da raiz do projeto. next.config.js
// roda antes de qualquer rota/módulo do app, então process.env já está
// populado quando o Prisma Client e o NextAuth forem instanciados.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// Versão exibida no rodapé do menu. Vem do package.json da raiz (fonte única
// da verdade) e é congelada no build — junto com a data, que é o que responde
// na prática "a correção de ontem já está no ar aí?" quando alguém reporta
// um problema.
const { version } = require("../../package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dilon-zap/db", "@dilon-zap/storage"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

module.exports = nextConfig;
