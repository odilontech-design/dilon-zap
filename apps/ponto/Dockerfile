# Contexto de build é a raiz do monorepo (os pacotes ponto-db, ponto-core e
# storage são consumidos como TS fonte).
FROM node:20-slim
WORKDIR /app

# O Prisma precisa do openssl para escolher a engine certa.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm install
RUN npm run ponto:generate
RUN npm run build -w apps/ponto

ENV NODE_ENV=production
EXPOSE 3002
# As migrações rodam antes de subir: o gatilho que torna a marcação imutável
# está numa delas, e um banco sem ele aceitaria UPDATE em registro de ponto.
CMD ["sh", "-c", "npm run ponto:deploy && npm run start -w apps/ponto"]
