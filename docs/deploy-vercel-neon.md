# Subir a demo na Vercel + Neon

Caminho recomendado enquanto o produto está em fase de apresentação a cliente:
banco no [Neon](https://neon.tech) e aplicação na [Vercel](https://vercel.com).

**Por que não na VPS que já existe:** ela é uma Oracle Always Free de
1 vCPU / 2 GB e é a mesma máquina onde o worker mantém a sessão do WhatsApp da
Believe aberta. Um `docker build` do Next ali dentro passa de 1 GB de pico; se
o OOM killer escolher o worker, a conexão do WhatsApp cai e pode precisar
reparear o número — cliente pagante fora do ar por causa de uma demo. Quando
o produto tiver clientes de verdade e merecer máquina própria, o runbook da
VPS continua válido em [`deploy-esquadrias.md`](./deploy-esquadrias.md).

O app de esquadrias é totalmente stateless (nenhuma escrita em disco, nenhum
processo de fundo), então roda em serverless sem adaptação. O Dilon Zap não
teria essa sorte — o worker Baileys precisa de processo longo, e por isso
continua na VPS.

---

## Antes de começar: o custo real

O **Neon Free** cobre a demo com folga.

A **Vercel Hobby é gratuita mas proibida para uso comercial** pelos termos
deles. Apresentar o sistema a um cliente para vendê-lo é uso comercial. Para
ficar em dia, o plano é o **Pro (US$ 20/mês)**. Vale saber disso antes, e não
depois de um e-mail da Vercel na véspera da apresentação.

Se preferir não pagar nesta fase, as alternativas honestas são o Railway ou o
Render (~US$ 5/mês, rodam o `Dockerfile` que já existe), ou a própria VPS com
a imagem construída fora dela.

---

## 1. Banco no Neon

1. Crie um projeto em <https://console.neon.tech> — região **AWS São Paulo
   (sa-east-1)**, que é a mais perto dos usuários.
2. Em **Connection string**, copie as **duas** URLs:
   - **Pooled** (o host tem `-pooler` no meio) → vai em `ESQUADRIAS_DATABASE_URL`
   - **Direct** (sem `-pooler`) → vai em `ESQUADRIAS_DIRECT_URL`

As duas são necessárias e não são intercambiáveis. A aplicação consulta pela
pooled, porque em serverless cada requisição pode virar uma instância nova e
sem o pooler as conexões do Postgres esgotam no primeiro pico. As migrações
usam a direta, porque o PgBouncer em modo transação não suporta os comandos
que uma migração precisa — pela pooled ela trava ou falha pela metade.

Ambas já vêm com `?sslmode=require`; mantenha.

## 2. Criar as tabelas e a empresa de demonstração

Isto roda **da sua máquina**, uma vez. A Vercel não executa migração no build
de propósito: build e migração falham de jeitos diferentes, e misturar os dois
transforma um erro de schema em deploy quebrado.

```bash
git checkout claude/saas-vidros-esquadrias-0twgtp
npm install

# aponte para o Neon (use a DIRETA nos dois, só nesta etapa)
export ESQUADRIAS_DATABASE_URL="<url direta do Neon>"
export ESQUADRIAS_DIRECT_URL="<url direta do Neon>"

npm run erp:generate
npm run erp:deploy     # cria as tabelas
npm run erp:seed       # Vidraçaria Modelo + catálogo + 6 tipologias
```

Esperado: `All migrations have been successfully applied.` e depois
`✔ Empresa "Vidraçaria Modelo" pronta — 13 perfis, 8 vidros, 12 ferragens, 6 tipologias.`

## 3. Projeto na Vercel

**New Project** → importe o repositório `odilontech-design/dilon-zap`.

| Campo | Valor |
| --- | --- |
| Framework Preset | Next.js |
| **Root Directory** | `apps/esquadrias` |
| **Include source files outside of the Root Directory** | **ligado** |
| Build Command | (padrão) |
| Install Command | (padrão) |

O "include source files outside" é obrigatório: o app importa
`packages/erp-db` e `packages/esquadrias-core`, que estão fora do Root
Directory. Sem isso o build falha em "module not found".

Não é preciso configurar comando de build especial. O `prebuild` do
`apps/esquadrias/package.json` gera o Prisma Client antes do `next build`,
porque o client é gerado e não versionado.

## 4. Variáveis de ambiente

Em **Settings → Environment Variables**:

| Variável | Valor | Ambientes |
| --- | --- | --- |
| `ESQUADRIAS_DATABASE_URL` | URL **pooled** do Neon | Production, Preview, Development |
| `ESQUADRIAS_DIRECT_URL` | URL **direta** do Neon | Production, Preview, Development |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://esquadrias.dilontech.com.br` | **só Production** |

O `NEXTAUTH_URL` fica só em Production de propósito: ele é uma URL absoluta, e
se valer também para os previews o login de um preview redireciona para o
domínio de produção e nunca volta.

Depois de salvar, **Deployments → Redeploy** (variável nova não entra num
build já feito).

## 5. Domínio

**Settings → Domains** → adicione `esquadrias.dilontech.com.br` e crie no seu
DNS o registro que a Vercel indicar (normalmente um `CNAME` para
`cname.vercel-dns.com`). O certificado sai sozinho em alguns minutos.

Se o domínio estiver no Cloudflare, siga a instrução da própria Vercel quanto
ao proxy — ela difere do que o Caddy da VPS exige.

## 6. Conferir

```bash
curl -sI https://esquadrias.dilontech.com.br/login | head -1     # HTTP/2 200
```

Entre com `dono@vidracariamodelo.com.br` / `troque-esta-senha` e confira o
roteiro do [README do app](../apps/esquadrias/README.md): a janela de
1200 × 1000 mm em branco tem que dar **R$ 1.030,53**.

**Troque essa senha em Equipe antes de mandar o link para o cliente.** O login
do seed é público — está neste repositório.

## 7. Backup da demo

Dado de demonstração é descartável (o seed recria tudo), então não vale montar
rotina de backup nesta fase. Se o cliente começar a cadastrar coisa de verdade
durante a avaliação, isso muda — e aí o caminho é o backup automático do Neon
(**Settings → Backups**, no plano pago) ou um `pg_dump` agendado.

Só não deixe a decisão implícita: a demo de hoje virando base de produção sem
ninguém decidir é como se perde o primeiro cadastro real de um cliente.

---

## Atualizar depois

`git push` na branch conectada e a Vercel refaz o deploy sozinha. Quando o
schema mudar, rode a migração **antes** do deploy:

```bash
export ESQUADRIAS_DIRECT_URL="<url direta do Neon>"
export ESQUADRIAS_DATABASE_URL="$ESQUADRIAS_DIRECT_URL"
npm run erp:deploy
```

## Se der errado

| Sintoma | Causa provável |
| --- | --- |
| Build falha em "module not found" nos pacotes internos | "Include source files outside of the Root Directory" desligado |
| `@prisma-erp/client` não encontrado no build | Root Directory errado — o `prebuild` só roda se for `apps/esquadrias` |
| Query falha em produção mas o build passou | Faltou o alvo `rhel-openssl-3.0.x` no schema (já está lá; confirme que o deploy é desta branch) |
| `too many connections` sob carga | `ESQUADRIAS_DATABASE_URL` está com a URL direta em vez da pooled |
| `migrate deploy` trava | O contrário: está usando a pooled onde precisa da direta |
| Login redireciona pro domínio errado num preview | `NEXTAUTH_URL` definido para todos os ambientes em vez de só Production |
| Primeira consulta do dia demora ~1s | Normal: o Neon Free escala a zero e acorda na primeira query |
