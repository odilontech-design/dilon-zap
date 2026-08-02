# Contexto de build é a raiz do monorepo — mesmo motivo do Dockerfile do web.
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN npm install

COPY . .
RUN npm run db:generate

ENV NODE_ENV=production
EXPOSE 4001
CMD ["npm", "run", "start", "-w", "apps/worker"]
