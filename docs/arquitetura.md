# Mapa da arquitetura do Dilon Zap

Escrito a partir do código em 23/11/2026, para quem vai desenvolver (o Gemini, o Claude, o fundador). **Onde algo é suposição, está dito.** Se o código mudar, atualize este arquivo no mesmo PR.

## 1. Visão em uma página

Um **monorepo** (`npm workspaces`) com vários aplicativos. O que está na hospedagem própria (uma VPS com Docker) e o que está na Vercel:

```
                      ┌──────────── VPS (docker-compose.prod.yml) ────────────┐
 navegador ─HTTPS──►  │ Caddy ──► web (Next.js, :3000)                         │
 (zap.dilontech...)   │             │  ▲ polling (SWR) a cada poucos segundos  │
 domínio de loja ──►  │             ▼  │                                       │
                      │          Postgres 18 (único banco do Zap)              │
                      │             ▲                                          │
                      │   worker (WhatsApp/Baileys, :4001 só interno) ──────────┼──► WhatsApp
                      │   sdr-worker · vendedor-ia-worker · portais-worker      │
                      │   esquadrias (Next.js, banco próprio)                   │
                      └─────────────────────────────────────────────────────────┘
 Ponto (apps/ponto): Vercel + Neon, banco e login próprios, fora do banco do Zap.
 Mídia (fotos, áudios, documentos): Cloudflare R2.   Cobrança: Asaas e Mercado Pago.
```

**Regra de ouro:** o `web` e o `worker` **não se chamam o tempo todo: conversam pelo banco**. O `web` grava, o `worker` lê (e vice-versa). Só algumas ações que precisam do WhatsApp "ao vivo" passam por uma chamada HTTP interna ao worker (item 5).

## 2. Onde fica cada coisa

| Pasta | O que é | Banco |
| --- | --- | --- |
| `apps/web` | **O sistema que o cliente usa**: telas, API e vitrines de loja (Next.js 14, App Router, NextAuth) | Zap |
| `apps/worker` | **Conexão com o WhatsApp** (Baileys): recebe e envia mensagens, resposta automática, avisos, mensagens agendadas | Zap |
| `apps/sdr-worker` | Prospecção comercial (Dilon SDR) e o vendedor de IA que responde quem respondeu | Zap |
| `apps/vendedor-ia-worker` | Atendente com IA das revendas de veículos | Zap |
| `apps/portais-worker` | Publicação de estoque nos portais (OLX, Webmotors, MobiAuto, NaPista) | Zap |
| `apps/esquadrias` | Produto separado (vidraçarias). Outro login, outro banco | Esquadrias |
| `apps/ponto` | Produto separado (Dilon Ponto). Vercel, outro login, outro banco | Ponto |
| `packages/db` | **Schema do Zap** (`prisma/schema.prisma`, 105 modelos) e o cliente Prisma | Zap |
| `packages/storage` | Mídia no R2 (API compatível com S3) | |
| `packages/push` | Notificação no celular (Web Push) | Zap |
| `packages/receivables` | Matemática de datas e dinheiro de contas a receber, **sem banco** (web e worker usam a mesma regra) | |
| `packages/portais` | Conectores dos portais (OLX, Webmotors, MobiAuto, NaPista) | Zap |
| `packages/vendedor-ia` | Vendedor IA: regras, custo por lead, chamada à API da Anthropic | Zap |
| `packages/sdr-core` | Regras do SDR (campanhas, prospectos, importação) | Zap |
| `packages/ambiente-teste` | Ferramentas de teste do SDR | |
| `packages/erp-db`, `esquadrias-core`, `ponto-core`, `ponto-db` | Dos outros produtos. **Fora** do banco do Zap | outros |

**O que esta documentação NÃO cobre:** Esquadrias, Ponto e ERP têm schema e chave de empresa próprios (`empresaId`, não `tenantId`). A verificação de `tenantId` (`npm run verificar`) só vale para o Zap.

## 3. O banco do Zap e a empresa (tenant)

- **Tenant = uma empresa cliente.** `packages/db/prisma/schema.prisma`.
- **87 dos 105 modelos têm `tenantId` próprio.** Os 18 que não têm (`Message`, `Pagamento`, `OrderItem`, `AuditLog`...) se ligam à empresa **por relação** (ex.: `Message → Conversation → tenantId`).
- **O isolamento entre empresas é só no código.** O banco não impede nada: nenhuma consulta é filtrada automaticamente. Toda consulta precisa levar `tenantId` (da sessão). **É a regra mais importante do projeto** (`docs/modelo-operacional-dev.md` e `docs/verificacao-tenant.md`).
- **Produção usa `prisma db push`**, sem histórico de migrações. Schema **só aditivo**. Valor novo de enum é o maior risco para o cliente Prisma antigo (a linha de dado com o valor novo quebra a leitura de quem ainda tem o cliente velho).
- **Não há tempo real por websocket.** As telas atualizam por **polling** (SWR com `refreshInterval`; ex.: o Inbox consulta lista de conversas, contagens e não lidas de tempos em tempos). Rota consultada assim não pode devolver a base inteira: use `select` enxuto e paginação.

## 4. Entrada, papéis e acesso

**Login:** NextAuth com e-mail e senha (`credentials`), sessão em **JWT** (sem tabela de sessão). No token vão `role` e `tenantId`. `apps/web/lib/auth.ts`. Desativado não entra.

**A checagem de acesso fica em cada rota, não no middleware.** O `middleware.ts` do web **não faz autenticação**: ele só resolve o **domínio próprio das lojas** (uma vitrine servida no domínio da revenda, reescrevendo para `/loja/<slug>`). Por isso **toda rota nova precisa começar com a sua checagem**:

| Função (`apps/web/lib/session.ts`) | Usar para |
| --- | --- |
| `requireUser()` | Área logada em geral. Também redireciona empresa suspensa por falta de pagamento |
| `requireOwner()` | O que é do responsável pela conta (usuários, horário) |
| `requireSuperAdmin()` | Só `/admin` e `/api/admin/*`. **Único** papel que atravessa empresas |

**Papéis (`UserRole`):** `OWNER`, `AGENT`, `FINANCEIRO`, `SUPERADMIN` (Dilon Tech).
- **Quem enxerga qual conversa:** `lib/conversation-access.ts`. Só OWNER e SUPERADMIN veem tudo; o AGENT vê o que é dele, do setor dele e da fila geral (conforme configuração da empresa). O FINANCEIRO tem uma exceção de cobrança. **Errar aqui vaza conversa de cliente entre setores**: a regra tem teste e não se muda sem revisão.
- **Gestão financeira e de catálogo:** `lib/papeis.ts` (`ehGerencia`). Não escreva `role === "OWNER" || ...` à mão.

**Planos e recursos:** `lib/plano-regras.ts` (puro, com teste) e `lib/plano.ts` (`exigirRecurso`, `recursosDoUsuario`).
- Planos: **Essencial** (até 3 atendentes), **Profissional** (até 8) e **Escala** (ilimitado).
- Quem contratou antes da tabela tem `plataformaCompleta` e recebe tudo: é promessa por escrito, **a tabela nunca desfaz isso**.
- Recursos **sob demanda** (ligados empresa por empresa, não entram em plano): multi-número, indicadores de SaaS, ótica, veículos, Vendedor IA, painel de e-commerce. `SDR` é restrito e só a Dilon Tech liga.
- O servidor confere o recurso **na rota** (`exigirRecurso`). Esconder o botão não é controle.

**Integração externa:** chaves de API (`lib/api-key.ts`): o valor em claro aparece uma vez; o banco guarda só o hash (SHA-256), comparado em tempo constante. Webhooks e crons têm segredo próprio (itens 5 e 7).

## 5. O `web` e o `worker`: como conversam

1. **Mensagem recebida:** o worker (Baileys) recebe do WhatsApp, grava `Contact`, `Conversation` e `Message` (função `recordMessage`, em `session-manager.ts`) e aplica menu de triagem, resposta automática, horário e setor. O `web` só **lê** (polling).
2. **Mensagem enviada pela tela:** o `web` grava uma `Message` com `status = PENDING` e **acorda o worker** por HTTP (`POST /internal/outbox/wake`). O worker tem um laço (`pollOutbox`) por sessão que pega as `PENDING`, envia e muda o status (`SENT`, `DELIVERED`, `READ`, `FAILED`) conforme os recibos.
3. **Ações que precisam do WhatsApp ao vivo** (checar número, editar ou apagar mensagem, reagir, marcar como lida, bloquear contato, sincronizar grupos, desconectar): o `web` chama o worker por HTTP em `/internal/*` (`apps/web/lib/worker-client.ts`). O endereço é `WORKER_INTERNAL_URL` e o segredo `WORKER_INTERNAL_SECRET`. **A porta 4001 só é alcançável dentro do Docker.**
4. **Credenciais do WhatsApp ficam no Postgres** (`WhatsAppSession.authCreds` e `WhatsAppSignalKey`): por isso **nunca** desenvolver sobre uma cópia do banco de produção (`docs/modelo-operacional-dev.md`, item 7).
5. **Um número = uma `WhatsAppSession`**, com setor dono opcional e a marca `semAutomacoes`. Hoje todas usam Baileys (conexão por QR Code, **não oficial**). A API oficial está planejada em `docs/zap-business-api-oficial.md`.

**`apps/worker/src/session-manager.ts` (2.685 linhas) é o coração em produção. Não se refatora sem necessidade e sem plano de reversão.**

## 6. Estrutura do `apps/web`

```
apps/web/
  app/
    (dashboard)/   telas da área logada: inbox, contatos, funil, pedidos, produtos, estoque, veículos,
                   ótica, financeiro (caixa, a pagar, a receber), relatórios, setores, usuários, SDR...
    api/           rotas de API (≈311 route.ts), uma pasta por assunto
      cron/        tarefas agendadas pelo cron da VPS (Bearer CRON_SECRET)
      webhooks/    Asaas e Mercado Pago (cobrança)
      admin/       só SUPERADMIN
      loja/        vitrines públicas das revendas
    login, cadastro, contratar, loja, recibo, imprimir, suspenso...
  components/      componentes compartilhados das telas
  lib/             regra de negócio e acesso ao banco (≈207 arquivos): a camada que as rotas usam
  middleware.ts    só domínio próprio das lojas (não é autenticação)
```

**Convenções que o projeto já segue (imite):**
- **Nomes e comentários em português.** Comentário explica o **porquê** (muitas vezes o caso real do cliente que motivou a regra).
- **Rota fina, regra em `lib/`.** Regra pura fica em arquivo sem banco, com teste.
- **Validação com `zod`**, `select` explícito, erro curto em português.
- **Ações sensíveis chamam `logAudit`** (`lib/audit.ts`).
- **Testes:** arquivos `*.test-manual.ts`, rodados com `npx tsx <arquivo>` (usam `node:assert`, sem banco). Alguns pacotes têm `npm run test:<nome>` (ex.: `test:vendedor-ia`).
- Cada empresa pode ter regras próprias (por exemplo, setores, visão da fila, termo "Orçamento" no lugar de "Pedido"): configuração no `Tenant`, não `if` por cliente.

## 7. Tarefas agendadas, cobrança e serviços externos

- **Cron:** a VPS chama `POST /api/cron/<nome>` com `Authorization: Bearer $CRON_SECRET`. Existem `erp-sync`, `instagram-renovar`, `napista-leads` e `sincronizar-sites`. Rota de cron **não usa sessão**: confere o segredo.
- **Cobrança:** Asaas (boleto, assinatura) e Mercado Pago, com webhooks em `app/api/webhooks/*`. Falta de pagamento suspende a empresa (`Tenant.suspensoEm`, `lib/suspensao.ts`, cache de 10 s).
- **Mídia:** Cloudflare R2 (`packages/storage`), com URL assinada de leitura. A chave do objeto nunca vai ao navegador.
- **IA:** Vendedor IA e vendedor do SDR chamam a API da Anthropic (`ANTHROPIC_API_KEY`), com **custo por lead registrado** e teto por loja (`packages/vendedor-ia/src/custo.ts`).
- **Portais de veículos:** OLX, Webmotors, MobiAuto, NaPista (`packages/portais`, `apps/portais-worker`). Segredos cifrados com `PORTAIS_CHAVE`.
- **Instagram:** webhook e renovação de token (`docs/instagram.md`).
- **Notificação no celular:** `packages/push` (VAPID).

## 8. Variáveis de ambiente (nomes, nunca valores)

`.env` na raiz do repositório (o `next.config.js` e o worker o carregam). Modelo em `.env.example`. Grupos principais:
- **Banco e login:** `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
- **Web ↔ worker:** `WORKER_INTERNAL_URL`, `WORKER_INTERNAL_SECRET`.
- **Cobrança:** `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN`, `MP_ACCESS_TOKEN`.
- **Cron e portais:** `CRON_SECRET`, `PORTAIS_CHAVE`, `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`.
- **IA:** `ANTHROPIC_API_KEY`.
- **Notificação:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Variáveis `PONTO_*` e `ESQUADRIAS_*` são dos outros produtos.

**Regra:** nenhuma chave de produção no computador de desenvolvimento. Desenvolva com o Postgres local do `docker-compose.yml` e o `db:seed`.

## 9. Como rodar localmente

```bash
docker compose up -d postgres        # banco local, vazio
npm install
npm run db:generate                  # cliente Prisma (arquivos locais, não acessa banco)
npm run db:push                      # confira o DATABASE_URL: SÓ o banco local!
npm run db:seed
npm run dev:web                      # web em http://localhost:3000
npm run dev:worker                   # WhatsApp (precisa de um número de teste, nunca o de um cliente)
npm run verificar                    # verificação de tenantId + testes + tipos
```

## 10. Onde colocar uma funcionalidade nova

| Quero... | Onde |
| --- | --- |
| Uma tela nova | `apps/web/app/(dashboard)/<assunto>/page.tsx`. Menu em `components/sidebar.tsx`. Se for de plano: conferir o recurso na tela **e** nas rotas |
| Uma rota de API | `apps/web/app/api/<assunto>/route.ts`, começando por `requireUser()` (e `exigirRecurso`, se houver) |
| Regra de negócio | `apps/web/lib/<assunto>.ts` (pura, sem banco, quando der) + teste `*.test-manual.ts` |
| Uma tabela ou coluna | `packages/db/prisma/schema.prisma`, **só aditivo**, com `tenantId` e `@@index([tenantId, ...])`. Mostrar o diff do schema separado |
| Algo que roda em segundo plano | Módulo novo no worker apropriado, **sem mexer no `session-manager.ts`** |
| Uma tarefa agendada | `app/api/cron/<nome>/route.ts` (Bearer `CRON_SECRET`) + linha no cron da VPS |
| Um recurso de plano | Valor no enum `Recurso` **só depois** de publicar o código que o conhece; regra em `plano-regras.ts` + teste |
| Chamada a API paga (IA, OCR) | Limite por empresa e registro de custo, como em `packages/vendedor-ia` |

## 11. Armadilhas conhecidas

- **Consulta sem `tenantId`** = vazamento silencioso (`npm run verificar` ajuda, não garante).
- **`update`/`delete` só pelo `id`** de um valor que veio do navegador.
- **Enum novo no Prisma** quebra o cliente antigo ao ler a linha nova. Ordem: publicar o código, depois ligar o dado.
- **Rota que o painel consulta de tempos em tempos** devolvendo a base inteira: custa tráfego o dia todo.
- **Mexer em `session-manager.ts`:** afeta todas as conexões de WhatsApp de todos os clientes.
- **Rodar o worker contra uma cópia do banco de produção:** conecta como o WhatsApp real do cliente.
- **Mudar a regra de visibilidade de conversa** (`conversation-access.ts`) sem teste: vaza atendimento entre setores.
- **`prisma db push` no banco errado:** confira o `DATABASE_URL`.

## 12. O que este mapa não sabe (para completar)

- Como o **cron da VPS** está de fato configurado hoje (os exemplos estão nos documentos de cada integração).
- O **processo de deploy** do Zap (como a VPS recebe uma versão nova); os documentos de deploy existentes são do Ponto e do Esquadrias.
- O **backup do Postgres** e a política de retenção.
- Quais clientes usam **cada recurso sob demanda** em produção (isso está no banco, que não consultei).
