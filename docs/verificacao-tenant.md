# Verificação automática: isolamento entre empresas (`npm run verificar`)

Serve para uma coisa: **impedir que código novo deixe uma empresa ver ou alterar dados de outra**. No Zap esse isolamento é feito só pelo código (o banco não impede nada), então uma única consulta sem o filtro `tenantId` já é um vazamento. Esta verificação procura esse tipo de falha **antes** de o código chegar à produção.

## É seguro rodar? Sim, não toca em banco

- **Só lê arquivos.** Lê os `.ts`/`.tsx` e o `schema.prisma` como texto e monta a árvore do código. **Não executa** o código analisado.
- **Não abre conexão com banco.** O programa nem importa o Prisma. Além disso, ele descarta do ambiente qualquer variável de endereço de banco (`DATABASE_URL` etc.). Há testes que garantem as duas coisas (um deles roda o comando com uma `DATABASE_URL` de produção falsa no ambiente).
- **Só grava um arquivo:** a linha de base (`scripts/verificar-tenant/baseline.json`), e só quando você pede `--atualizar-baseline`.
- Não precisa de `.env`, não precisa de internet.

## Como rodar

Na raiz do repositório:

| Comando | O que faz |
| --- | --- |
| `npm run verificar` | **Tudo:** verificação de empresas + testes da ferramenta + checagem de tipos (web e worker). Rode antes de entregar qualquer código |
| `npm run verificar:tenant` | Só a verificação de empresas. Rápida (segundos) |
| `npm run verificar:tenant -- --tudo` | Também lista o que já estava aceito na linha de base |
| `npm run verificar:tenant -- --arquivo apps/web/app/api/x/route.ts` | Analisa só um arquivo (pode repetir `--arquivo`) |
| `npm run verificar:tenant -- --estrito` | Avisos novos também reprovam |
| `npm run verificar:tenant -- --json` | Saída para máquina |
| `npm run test:verificar` | Só os testes da ferramenta (42 testes) |

A checagem de tipos precisa do cliente do Prisma gerado, uma vez por máquina: `npm run db:generate` (gera arquivos locais, **não acessa o banco**).

## O que ela procura

| Regra | O que acusa | Gravidade |
| --- | --- | --- |
| **R1** | Leitura (`findMany`, `findFirst`, `findUnique`, `count`...) num modelo que tem `tenantId`, sem filtrar por ele | ERRO |
| **R2** | `update`, `delete`, `upsert`, `updateMany`, `deleteMany` sem `tenantId` no `where`. Inclui o caso de filtrar **só por `id`** | ERRO |
| **R3** | `create`/`createMany` sem `tenantId` nos dados (registro nasce sem dono) | ERRO |
| **R4** | `tenantId` vindo do pedido (`params`, `body`, `query`...) em vez da sessão | ERRO |
| **R5** | SQL cru: `$queryRawUnsafe` é ERRO; `$queryRaw` sem a palavra `tenantId` é AVISO | ERRO / AVISO |
| **R6** | Rota de API sem nenhuma checagem de acesso reconhecível | AVISO |
| **R7** | Campo secreto (`passwordHash`, credenciais do WhatsApp) selecionado em rota de API | AVISO |
| **R8** | Isenção `verificar-tenant: ok` **sem motivo** | ERRO |
| **R9** | Modelo **sem** `tenantId` próprio (ex.: `Message`) alterado só pelo `id` | AVISO |

Aceita como filtro de empresa: `tenantId` no `where`, dentro de `AND`, ou num filtro de relação (`where: { conversation: { tenantId } }`).

## Como ler o resultado

```
NOVOS (não estavam na linha de base): 1 erro(s), 0 aviso(s)
ERRO  R2 [ALTA]  apps/web/app/api/x/route.ts:42
         Contact.delete filtra só por `id`: quem souber o id de outra empresa lê ou altera o dado dela.

RESULTADO: REPROVADO.
```

- **ERRO:** falha provável de isolamento. Reprova.
- **AVISO:** a ferramenta **não consegue provar** que está certo (filtro em variável, id de registro já carregado...). Não reprova, mas pede olho humano.
- **INFO:** área de administração, onde SUPERADMIN pode atravessar empresas de propósito.
- **[ALTA]:** erro numa rota que o usuário acessa direto (`apps/web/app/api`). Olhe primeiro.
- **NOVOS** é o que importa: o que **você** acabou de introduzir.
- **JÁ CONHECIDOS:** o que existia antes e foi aceito (próximo item).

**Código de saída:** 0 = aprovado; 1 = reprovado; 2 = falha ao executar.

## A linha de base (por que existe)

O Zap já está em produção com clientes e tem código antigo que a ferramenta não consegue provar que está certo. Em vez de reescrever módulos, o estado atual foi **registrado** em `scripts/verificar-tenant/baseline.json` (519 itens: 122 erros e 397 avisos). A verificação só reprova o que for **novo**.

- Cada item é identificado pelo arquivo, a regra e o conteúdo da chamada, **não pela linha**: mexer em outras partes do arquivo não ressuscita itens antigos.
- Quando alguém corrige um item antigo, a verificação avisa ("Corrigidos desde a última linha de base"): rode `--atualizar-baseline` para a lista encolher.
- **Quem atualiza a linha de base:** só o Tech Lead (Claude) ou o fundador, depois de olhar o diff. O Gemini **não** deve rodar `--atualizar-baseline` para "fazer passar": isso aceita o risco sem ninguém ver.

### Situação em 22/11/2026 (primeira execução)

- 292 arquivos analisados; **19 achados de prioridade ALTA** na linha de base.
- Revisados à mão nesta etapa: **9 dos 19**. **Nenhum era um vazamento**: o código confere a empresa por outro caminho (ex.: helper `funilDaEmpresa`, lista de ids validada antes, token público por desenho). Os outros 10 e os erros de prioridade média ainda **não foram revisados um a um**.

## Quando reprovar: o que fazer

1. **Corrigir o código.** É o caminho normal. Padrões aceitos:
   - leitura: `findFirst({ where: { id, tenantId: user.tenantId } })`;
   - alterar/apagar: `updateMany({ where: { id, tenantId: user.tenantId }, data })` ou `update({ where: { id, tenantId: user.tenantId } })` (o Prisma 5 permite);
   - criar: sempre `tenantId: user.tenantId` nos dados.
2. **Se for de propósito** (rota pública por token, webhook, administração), marque no código com motivo:
   ```ts
   // verificar-tenant: ok — rota pública: a empresa vem do token do portal, não do pedido
   const conta = await prisma.portalConta.findUnique({ where: { leadToken: params.token } });
   ```
   O motivo precisa ter pelo menos 10 letras e **será questionado na revisão**. Isenção sem motivo reprova (R8).
3. **Nunca** editar o `baseline.json` à mão nem regerar para "limpar" o erro.

## O que ela NÃO garante (limites)

É uma análise estática simples: aponta o que é **provavelmente** perigoso, não prova que o resto é seguro. Não cobre:

- **O caminho do `id` até a consulta.** Se o código confere a empresa por um auxiliar (`funilDaEmpresa(...)`) ou numa linha de outra função, a ferramenta marca como aviso ou erro (falso positivo) ou, no sentido contrário, aceita "busca-depois-age" por heurística (pode aceitar um id diferente do que foi conferido).
- **Permissões por papel** (quem pode editar o quê): só confere se existe alguma checagem de acesso, não se é a certa.
- **Acesso dinâmico** (`prisma[modelo]`), consultas montadas fora do literal e SQL cru complexo: viram AVISO.
- **Relações aninhadas em `include`** e dados retornados na resposta.
- **Ponto, Esquadrias e ERP:** têm outro schema e outra chave (`empresaId`). Fora desta verificação.
- **Testes de dois clientes de verdade** (o cliente A não enxerga o B): continuam sendo teste manual ou automatizado à parte.

Por isso a revisão do Tech Lead continua obrigatória (`docs/modelo-operacional-dev.md`). A ferramenta reduz o que precisa ser lido; não substitui a leitura.

## Onde está o código

```
scripts/verificar-tenant/
  analisador.ts   as regras (sem banco, sem rede)
  modelos.ts      lê o schema.prisma como texto
  cli.ts          o comando e a linha de base
  baseline.json   o que já existia e foi aceito
  fixtures/       exemplos de código inseguro e seguro, usados só nos testes
  verificar-tenant.test.ts   42 testes
```
