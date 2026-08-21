# Esquadrias — SaaS de gestão para vidraçarias e serralherias

Sistema de orçamento, produção e financeiro para quem trabalha com **vidros e
esquadrias de alumínio**. É o segundo produto da Dilon Tech no monorepo, com
banco e assinatura próprios (o `apps/web` é o Dilon Zap, de atendimento por
WhatsApp — os dois não compartilham dados).

## A ideia

O concorrente vende um catálogo fechado de milhares de tipologias prontas.
Funciona até a serralheria trabalhar com outra linha de perfil, outra folga de
montagem ou outro fornecedor — e aí ela volta pro Excel.

Aqui a **tipologia é dado do cliente**, não código nosso. Uma tipologia é um
molde paramétrico: dado o vão (largura × altura), fórmulas escritas pela
própria empresa geram a lista de cortes, os vidros e as ferragens.

```
Trilho superior e inferior   qtd: 2                comprimento: L
Folha — vertical             qtd: 4                comprimento: H - 60
Folha — horizontal           qtd: 4                comprimento: (L + transpasse) / 2 - 30
Vidro da folha               qtd: 2   largura: (L + transpasse) / 2 - 100 - folgaVidro
Dobradiças                   qtd: se(H > 2100, 4, 3)
```

Disso sai, na mesma tela: custo aberto (alumínio por peso, vidro por m²,
ferragem por peça), margem, preço, relação de materiais e plano de corte
otimizado das barras de 6 metros.

## Estrutura

```
apps/esquadrias/          Next.js 14 (App Router) — todas as telas e a API
packages/esquadrias-core/ Motor puro, sem banco: fórmulas, expansão, preço, corte
packages/erp-db/          Schema Prisma + seed (banco próprio)
```

O motor fica separado de propósito: é testável sem banco (`npm run test:core`,
28 testes) e reaproveitável fora do Next — worker de PDF, API pública, app de
campo.

### O que mora onde

| Assunto | Arquivo |
| --- | --- |
| Avaliador de fórmulas (parser próprio, sem `eval`) | `packages/esquadrias-core/src/formula.ts` |
| Expansão da tipologia em peças reais | `packages/esquadrias-core/src/tipologia.ts` |
| Custo, margem, imposto, totais | `packages/esquadrias-core/src/precificacao.ts` |
| Otimização de corte das barras | `packages/esquadrias-core/src/corte.ts` |
| Relação de materiais agregada | `packages/esquadrias-core/src/materiais.ts` |
| Ponte banco → motor | `apps/esquadrias/lib/calculo.ts` |
| Recursos por plano | `apps/esquadrias/lib/planos.ts` |

## Rodando

Pré-requisito: Docker (só pro Postgres) e Node 20+. A partir da raiz do
monorepo:

```bash
cp .env.example .env          # preencha NEXTAUTH_SECRET e ESQUADRIAS_DATABASE_URL
docker compose up -d          # sobe o Postgres (cria os dois bancos)
npm install
npm run erp:generate          # gera o Prisma Client do ERP
npm run erp:push              # cria as tabelas
npm run erp:seed              # empresa de demonstração + catálogo + 6 tipologias
npm run dev:esquadrias        # http://localhost:3001
```

Login criado pelo seed: `dono@vidracariamodelo.com.br` / `troque-esta-senha`
(o seed também cria vendedor, produção e financeiro, com a mesma senha, pra
conferir o que cada papel enxerga).

Testes do motor de cálculo:

```bash
npm run test:core
```

## Decisões que valem saber

**Fórmula é dado, e por isso o parser é próprio.** A expressão vem do banco,
escrita por um cliente do SaaS, e é avaliada no servidor. Com `eval` ou
`new Function`, qualquer assinante leria o ambiente do processo — e o segredo
de outro tenant junto. O parser em `formula.ts` só enxerga o escopo que recebe.

**Orçamento aprovado é documento, não consulta.** Cada item guarda a memória
de cálculo (peças, vidros, ferragens e preços já expandidos) em JSON. O preço
do alumínio muda toda semana; sem o snapshot, reabrir um orçamento assinado
mostraria um valor diferente do que o cliente aprovou. A partir da aprovação o
orçamento não é recalculado nem editado.

**O custo aparece pro vendedor.** Quem não vê o custo não sabe até onde pode
negociar — é assim que se vende no prejuízo sem perceber. A margem efetiva
fica ao lado do campo de desconto, para mostrar na hora o que "dar 10%" fez com
o lucro. O papel `PRODUCAO` é a exceção: vê medida e perfil, não vê preço.

**A serra entra na conta.** Três peças de 2000 mm não cabem numa barra de
6000 mm quando o disco come 3 mm por corte. O plano de corte desconta isso, e
separa sobra reaproveitável de refugo pelo limite que a empresa configurou.

**Perda de alumínio é custo.** A barra é comprada inteira; o retalho que não
vira peça é pago do mesmo jeito. Ignorar isso é a diferença silenciosa entre a
margem do sistema e a do extrato bancário.

**Multi-tenant em toda consulta.** Nenhuma rota faz `findUnique({ id })` a
partir de um id de URL: o `empresaId` entra no `where` de toda leitura e de
todo update, então um id de outra empresa simplesmente não encontra nada.

## Planos

| | Básico | Essencial | Avançado |
| --- | --- | --- | --- |
| Orçamento com tipologia paramétrica | ✓ | ✓ | ✓ |
| Relação de materiais | ✓ | ✓ | ✓ |
| Clientes, obras, proposta e contrato | ✓ | ✓ | ✓ |
| Usuários | 3 | ilimitados | ilimitados |
| Financeiro, agenda, relatórios, metas | | ✓ | ✓ |
| Plano de corte, etiquetas, checklist, ordem de serviço, API | | | ✓ |

A trava de plano está no **servidor** (`requireRecurso` nas páginas,
`exigirRecurso` na API). Esconder o item do menu não é controle de acesso —
quem digitar a URL entra. Mesmo assim o item continua visível e leva à tela de
upgrade: esconder faria a serralheria nunca descobrir o que ela pagaria a mais
para ter.

## O que ainda não está pronto

- Cobrança automática de assinatura (a troca de plano é feita no cadastro).
- Etiquetas de corte/produto, checklist de produção e ordem de serviço são
  recursos anunciados no plano Avançado, mas as telas ainda não existem — só o
  plano de corte está implementado.
- API pública (o `API_PUBLICA` do plano ainda não tem endpoints externos).
- Upload de logotipo: hoje é uma URL; falta ligar no R2 como o `apps/web` faz.
- Projeto de vidro (desenho técnico da chapa) e compartilhamento da obra ao
  vivo com o cliente final.
