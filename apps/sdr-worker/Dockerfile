# Contexto de build é a raiz do monorepo — mesmo motivo do Dockerfile do worker.
# Processo próprio do SDR: não importa o worker do WhatsApp nem abre porta.
FROM node:20-slim
WORKDIR /app

# node:20-slim não vem com openssl; sem ele o Prisma não carrega a query engine.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/sdr-worker/package.json apps/sdr-worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/sdr-core/package.json packages/sdr-core/package.json
RUN npm install

COPY . .
RUN npm run db:generate

ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "apps/sdr-worker"]
