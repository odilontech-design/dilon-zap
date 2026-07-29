# Dilon Zap

Plataforma própria de atendimento via WhatsApp da Dilon Tech — substitui a Jet Sales Brasil na Believe Cosméticos e nasce pensada como SaaS multi-tenant para outros negócios.

Ver a proposta de arquitetura completa (diagrama, mitigação de risco de banimento, roadmap por fases) no documento compartilhado no chat.

## Fase 0 (estado atual)

- Multi-tenant no banco (`Tenant` → `User`, `WhatsAppSession`, `Contact`, `Conversation`, `Message`)
- Conexão com um número de WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys), com sessão persistida no Postgres (não em arquivo local — sobrevive a reinício/redeploy do worker)
- Login com email/senha, tela de conexão (QR Code) e inbox básico (uma conversa por vez, texto simples)
- Sem fila de verdade ainda (Redis/BullMQ entra na Fase 2, junto com campanhas e throttling anti-ban) — o worker varre mensagens pendentes no próprio Postgres a cada 2s

## Estrutura

```
apps/
  web/      Next.js — dashboard (login, conectar número, inbox)
  worker/   Processo Node de longa duração — conexão(ões) Baileys
packages/
  db/       Schema Prisma + client compartilhado entre web e worker
```

`apps/worker` precisa ficar sempre rodando — é ele quem mantém a conexão com o WhatsApp aberta. Diferente do `apps/web`, não dá pra rodar em função serverless (Vercel), por isso web e worker são deploys separados.

## Rodando localmente

Pré-requisito: Docker (só pro Postgres) e Node 20+.

```bash
cp .env.example .env
# gere um valor pra NEXTAUTH_SECRET (ex: openssl rand -base64 32) e cole no .env

docker compose up -d        # sobe o Postgres
npm install                 # instala tudo (workspaces)
npm run db:generate         # gera o Prisma Client
npm run db:push             # cria as tabelas
npm run db:seed             # cria o tenant "Believe Cosméticos" + usuário owner
```

Depois, em dois terminais separados:

```bash
npm run dev:worker          # mantém a conexão com o WhatsApp
npm run dev:web             # dashboard em http://localhost:3000
```

Login criado pelo seed: `contato@believecosmeticos.com.br` / `troque-esta-senha` (troque depois de logar — Fase 0 não tem tela de trocar senha ainda, faça direto no banco ou via `prisma studio`).

Fluxo de teste: entre no dashboard → **Conectar número** → escaneie o QR Code com um WhatsApp (Aparelhos conectados → Conectar um aparelho) → mande uma mensagem de teste pro número conectado → ela aparece em **Inbox** em poucos segundos.

## Variáveis de ambiente

Ver `.env.example`. Um único `.env` na raiz serve pro `web`, `worker` e Prisma — cada um carrega esse arquivo explicitamente (ver `next.config.js`, `apps/worker/src/index.ts` e os scripts `db:*` em `packages/db/package.json`).
