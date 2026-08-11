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

### Rodando contra o banco de produção

O Postgres de produção roda num container na VPS e **não publica porta no host** — fica só na rede interna do Docker. Pra alcançá-lo de fora, suba o túnel SSH:

```bash
./scripts/db-tunnel.sh
```

Ele resolve o IP do container na hora (esse IP muda a cada recriação, fixar dá túnel apontando pro lugar errado em silêncio) e abre `localhost:5433`. Deixe rodando num terminal e aponte o `DATABASE_URL` do `.env` pra ele.

Duas armadilhas que já custaram tempo:

- **Túnel fora do ar não dá erro claro**, só timeout de conexão do Prisma. Se o app local "travou" no banco, confira o túnel primeiro.
- **É produção de verdade.** Mensagem enviada pelo Inbox local entra na fila que o worker de produção consome, e vai parar no WhatsApp do cliente. Pra mexer à vontade, use a cópia congelada do Neon (a URL está comentada no `.env`) — mas lembre que os dados são do dia da migração, e isso não aparece em lugar nenhum na tela: o app sobe normal e mostra dados plausíveis, só velhos.

## Variáveis de ambiente

Ver `.env.example`. Um único `.env` na raiz serve pro `web`, `worker` e Prisma — cada um carrega esse arquivo explicitamente (ver `next.config.js`, `apps/worker/src/index.ts` e os scripts `db:*` em `packages/db/package.json`).

## Deploy em produção

Rodando numa VM (Oracle Cloud Always Free, `zap.dilontech.com.br`) via Docker Compose: `web` e `worker` cada um no seu container, [Caddy](https://caddyserver.com/) na frente cuidando de HTTPS automático (Let's Encrypt) — ver `docker-compose.prod.yml` e `Caddyfile`. Postgres (Neon) e mídia (Cloudflare R2) continuam sendo os mesmos serviços na nuvem usados em desenvolvimento, não rodam na VM.

```bash
# na VM, com o repositório clonado e o .env de produção configurado
# (ver .env.production.example — principal diferença do .env local é
# WORKER_INTERNAL_URL/HOST, porque web e worker viram hosts diferentes)
docker compose -f docker-compose.prod.yml up -d --build
```

DNS: registro tipo A apontando `zap` pro IP público da VM, configurado no provedor do domínio (Registro.br). Firewall: a VM precisa liberar as portas 80 e 443 (na Oracle Cloud isso é na Security List da VCN, além do firewall do sistema operacional).

A sessão do WhatsApp persiste no Postgres — subir o worker numa VM nova não exige escanear QR Code de novo, desde que aponte pro mesmo banco.
