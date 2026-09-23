# Contexto de build é a raiz do monorepo (precisa dos workspaces
# packages/db e packages/storage, consumidos como TS fonte, sem etapa de
# compilação própria).
FROM node:20-slim
WORKDIR /app

# node:20-slim (Debian) não vem com openssl — sem isso o Prisma não consegue
# detectar a versão de libssl certa e o client falha em runtime (não só um
# aviso: a query engine não carrega de verdade sem esse pacote).
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
RUN npm run db:generate

# A chave pública das notificações precisa existir NO BUILD: o Next troca cada
# NEXT_PUBLIC_* pelo valor dentro do bundle que vai pro navegador, e o
# env_file do compose só chega em runtime — tarde demais. Sem isso o botão de
# ativar aviso some e vira "este navegador não recebe notificação" num Chrome
# que recebe muito bem. Ela é pública por natureza (o navegador a entrega ao
# serviço de push); a privada continua só no servidor, em runtime.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN npm run build -w apps/web

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]
