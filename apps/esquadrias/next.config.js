const path = require("node:path");

// Mesmo padrão do apps/web: monorepo sem .env por app, então carrega o da
// raiz antes de qualquer rota tocar em process.env.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { version } = require("../../package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dilon-zap/erp-db", "@dilon-zap/esquadrias-core"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

module.exports = nextConfig;
