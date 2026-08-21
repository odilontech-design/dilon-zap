# Contexto de build é a raiz do monorepo (precisa dos workspaces
# packages/erp-db e packages/esquadrias-core, consumidos como TS fonte, sem
# etapa de compilação própria).
FROM node:20-slim
WORKDIR /app

# node:20-slim (Debian) não vem com openssl — sem isso o Prisma não consegue
# detectar a versão de libssl certa e a query engine não carrega em runtime.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/esquadrias/package.json apps/esquadrias/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/erp-db/package.json packages/erp-db/package.json
COPY packages/esquadrias-core/package.json packages/esquadrias-core/package.json
RUN npm install

COPY . .
# O client do ERP é gerado em node_modules/@prisma-erp/client — precisa existir
# ANTES do build, porque o Next resolve os tipos dele em tempo de compilação.
RUN npm run erp:generate
RUN npm run build -w apps/esquadrias

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "apps/esquadrias"]
