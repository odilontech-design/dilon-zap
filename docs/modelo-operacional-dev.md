# Modelo operacional de desenvolvimento (Gemini executa, Claude revisa)

Vale para o Dilon Zap, Zap Business (API oficial), Veículos, Agendamento, OCR
para óticas e os futuros agentes de IA. Quem decide é o fundador; este
documento só registra como o trabalho passa de mão em mão.

## 1. Papéis

| | Gemini (executor) | Claude (Tech Lead) |
| --- | --- | --- |
| Faz | Primeira versão: CRUDs, telas, formulários, validações, componentes, testes, documentação, scripts, schema Prisma inicial | Arquitetura, integração com o que já existe, multi-tenancy, segurança, revisão, refatoração, decisão de design, compatibilidade com produção |
| Não faz | Decidir arquitetura, mexer em autenticação, cobrança, conexão do WhatsApp, infraestrutura ou schema em produção | Aprovar o próprio código sem revisão independente (testes, tipos e build) |
| Entrega | Código numa **branch própria** + o relatório do item 3 | Veredito + ajustes + riscos + o que testar, em linguagem simples |

O código do Gemini é tratado como o de um desenvolvedor da equipe: **não se
presume correto**. A revisão procura falha, não confirmação.

## 2. Fluxo

1. O fundador descreve a necessidade (o problema do cliente, não a solução).
2. O Gemini recebe o **briefing do item 3** + a necessidade e gera a primeira versão, **numa branch** (`gemini/<assunto>`), nunca na `main`.
3. O fundador traz a branch (ou o diff) para o Claude, com o relatório do Gemini.
4. O Claude revisa com o **checklist do item 4**, corrige o que for necessário e adapta ao padrão do projeto.
5. O Claude responde com **veredito**: `APROVADO`, `APROVADO COM AJUSTES` (já aplicados) ou `BLOQUEADO` (e por quê).
6. O fundador aprova o merge. Mudança de **risco alto** (item 5) só entra com aprovação explícita e plano de reversão.

## 3. Briefing para colar no Gemini

> Você é um desenvolvedor da Dilon Tech trabalhando no monorepo `dilon-zap`
> (Next.js 14 App Router em `apps/web`, Prisma em `packages/db`, worker em
> `apps/worker`). Seu código será revisado por um Tech Lead. Siga estas regras;
> o que não souber, **pergunte, não invente**.
>
> **Multi-tenancy (a regra mais importante).** O isolamento entre empresas é
> feito só no código: o banco não impede nada.
> - O `tenantId` vem **sempre** da sessão (`const user = await requireUser()` de `@/lib/session`, depois `user.tenantId`). **Nunca** do body, da query ou da URL.
> - **Toda** consulta Prisma sobre dado de empresa leva `tenantId` no `where`. Isso inclui `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`, `update*`, `delete*` e `create`.
> - Operação por id: `findFirst({ where: { id, tenantId: user.tenantId } })` e só então agir, ou `updateMany`/`deleteMany` com `tenantId`. **Não use** `findUnique`, `update` ou `delete` só pelo id.
> - Id vindo do cliente que aponta para outra tabela (ex.: `contactId`, `stageId`, `responsavelId`) deve ser conferido como pertencente ao mesmo tenant antes de gravar.
> - Dentro de `include`/relações aninhadas, o filtro de tenant também vale.
> - Só o papel `SUPERADMIN` atravessa tenants, e só em `/admin` e `/api/admin/*`, com `requireSuperAdmin()`.
>
> **Acesso.** Rota ou página protegida começa com `requireUser()`; o que é do dono usa `requireOwner()`; o lado financeiro usa `ehGerencia(user.role)` (`@/lib/papeis`); recurso de plano usa `exigirRecurso` (`@/lib/plano`). Não crie outra forma de checar papel. Ação sensível chama `logAudit` (`@/lib/audit`).
>
> **Entrada e saída.** Valide todo body/query com `zod`, com limites de tamanho. Use `select` explícito: nunca devolva o objeto inteiro (há `passwordHash`, chaves e tokens nas tabelas). Erro devolve mensagem curta em português, sem stack e sem dados de outro cliente.
>
> **Schema (`packages/db/prisma/schema.prisma`).** Produção usa `prisma db push`, sem histórico de migrações. Portanto: **só mudança aditiva** (tabela, coluna opcional ou com default, índice). **Nunca** renomear, remover ou mudar o tipo de campo existente, nem tornar opcional em obrigatório. Toda tabela nova de dado de empresa tem `tenantId`, relação com `Tenant` e `@@index([tenantId, ...])`. Mostre o diff do schema separado.
>
> **Não toque** (peça ao Tech Lead): `lib/auth.ts`, `lib/session.ts`, `middleware.ts`, cobrança (`asaas*`, `billing*`), conexão do WhatsApp no worker, `docker-compose*`, variáveis de ambiente e arquivos `.env`.
>
> **Custo e desempenho.** Rotas consultadas por polling não devolvem a base inteira: paginação, `select` enxuto, sem consulta dentro de laço (N+1). Nada de dependência nova sem justificar. Chamada a API paga (IA, OCR) precisa de limite por empresa e registro do custo (veja `packages/vendedor-ia`).
>
> **Estilo.** TypeScript estrito, sem `any` novo. Comentário em português explicando **por quê**, não o quê. Siga o padrão dos arquivos vizinhos (nomes em português, `lib/` para regra pura, rota fina). Testes de regra pura seguem os `*.test-manual.ts` (`npx tsx <arquivo>`).
>
> **Dados e segurança.** Nunca coloque segredo, telefone ou nome de cliente real no código, em log ou em teste. Não registre o conteúdo de mensagens em `console.log`.
>
> **Ao terminar, entregue este relatório:** (1) lista de arquivos criados e alterados; (2) diff do schema, se houver; (3) para **cada** consulta ao banco, onde está o filtro de `tenantId`; (4) o que você **não** soube resolver ou supôs; (5) como testar à mão; (6) o que roda a cada minuto ou a cada requisição.

## 4. Checklist de revisão do Claude

**Isolamento entre empresas**
- [ ] Toda consulta tem `tenantId` da sessão; nenhuma `findUnique`/`update`/`delete` só por id.
- [ ] Ids recebidos do cliente conferidos contra o tenant antes de gravar.
- [ ] Relações aninhadas e `groupBy`/`aggregate` também filtradas.
- [ ] Worker e jobs: o tenant vem do registro, não de entrada externa.
- [ ] Webhook ou rota pública: como identifica a empresa e se dá para falsificar.

**Acesso e segurança**
- [ ] `requireUser`/`requireOwner`/`ehGerencia`/`exigirRecurso` no lugar certo, também em Server Actions e rotas de API (esconder o botão não é controle).
- [ ] Validação `zod` com limites; upload com tipo e tamanho; sem SQL cru com texto do usuário.
- [ ] `select` explícito, sem vazar `passwordHash`, tokens ou campos internos (custo, margem, observação interna).
- [ ] Sem segredo no código; sem dado pessoal em log.
- [ ] Ações sensíveis auditadas.

**Produção e compatibilidade**
- [ ] Schema só aditivo; o cliente Prisma antigo (site no ar) ainda lê os dados depois do `db push`. Enum novo é o ponto de maior risco.
- [ ] Comportamento atual dos clientes (Believe, Hemoderi, Vai Viajar, Sales) preservado: regra antiga de plataforma completa, planos, recursos sob demanda.
- [ ] Plano de reversão: como desfazer sem perder dado.
- [ ] Passos de ativação em produção, em ordem, e o que ligar só para a Dilon Tech primeiro.

**Desempenho e custo**
- [ ] Nada de N+1, resposta sem paginação nem consulta pesada em polling.
- [ ] Índice cobrindo o filtro novo (`tenantId` primeiro).
- [ ] Custo mensal estimado (banco, chamadas de IA/OCR, armazenamento). Teto por empresa quando houver API paga.

**Qualidade**
- [ ] `tsc` sem erros, build ok, testes de regra pura passando.
- [ ] Teste do que importa: caso de dois tenants (o A não enxerga o B), sem permissão, entrada inválida.
- [ ] Simplicidade operacional: dá para o fundador operar e o suporte explicar?

## 5. Níveis de risco

| Nível | Exemplos | Regra |
| --- | --- | --- |
| Baixo | Tela, texto, componente, relatório de leitura, teste, documentação | Revisão do Claude e merge |
| Médio | Nova rota ou tabela aditiva, regra de plano, envio de mensagem, integração nova | Revisão + teste com dois tenants + ativar primeiro só para a Dilon Tech |
| Alto | Autenticação, sessão, cobrança, schema com mudança destrutiva, worker do WhatsApp, API oficial (Business), IA que responde cliente sozinha, qualquer coisa com dado entre empresas | O Gemini **não implementa sozinho**. O Claude desenha, o fundador aprova, há plano de reversão e ativação gradual |

## 6. Como o fundador traz o trabalho ao Claude

```
Necessidade: <1 frase, do ponto de vista do cliente>
Branch ou diff: <link ou colar>
Relatório do Gemini: <colar>
Cliente afetado / urgência: <quem usa e se é para hoje>
```

O Claude responde sempre com: **veredito**, **o que mudei e por quê**, **riscos
que sobram**, **o que testar à mão** e **o que fazer em produção, em ordem**.

## 7. Ambiente de desenvolvimento seguro

- **Banco de desenvolvimento: Postgres local e vazio, com dados de teste** (`docker-compose.yml` e `npm run db:seed`). **Não** copie o banco de produção (por exemplo, uma branch do Neon com dados) para desenvolver: ele traz telefones e conversas de clientes (LGPD) e as **credenciais de conexão do WhatsApp** (o worker as guarda no Postgres, em `apps/worker/src/postgres-auth-state.ts`). Subir o worker contra essa cópia conecta como o WhatsApp real do cliente, pode derrubar a sessão em produção e disparar mensagens de verdade. Se um dia precisar de uma branch do Neon, só com o schema, sem dados, e sem rodar o worker nela.
- **Comandos do Prisma só contra o banco local.** Confira o `DATABASE_URL` do `.env` antes de rodar `db push`. Nunca use `migrate reset`, `db push --force-reset` nem `--accept-data-loss`. O Zap não usa migrations em produção.
- **Nenhuma URL ou chave de produção no `.env` do computador de desenvolvimento.** Segredos de produção ficam só no servidor.
- **Chave de API do Gemini:** projeto próprio de desenvolvimento, **com cobrança ativada** (na camada gratuita o conteúdo enviado pode ser usado pelo Google para melhorar produtos; confira os termos atuais), com alerta de gasto. Entrar sempre com a **conta da empresa** (`@dilontech.com.br`), não com conta pessoal. Plano gratuito de qualquer IA (Gemini, OpenRouter) só com código sem segredo e sem dado de cliente.
- **Ferramentas no editor:** abrir só a pasta `dilon-zap`, nunca a pasta pai com vários projetos. Modo "planejar" antes de "agir" e **sem aprovação automática** de edição ou de comando no terminal.

## 8. Combinados que não mudam

- Nenhuma alteração em produção sem o fundador saber, e nada que comprometa cliente em produção.
- O Gemini não recebe credenciais de produção (banco, Asaas, chaves de API). Trabalha em banco local (item 7).
- Ninguém envia direto para a `main`: tudo passa por branch e revisão.
- Autenticação só muda com justificativa escrita.
- Simplicidade operacional e custo de infraestrutura entram em toda decisão; as explicações ao fundador são em linguagem simples, com o risco dito claramente.
