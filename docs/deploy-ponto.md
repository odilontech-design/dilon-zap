# Colocar o Dilon Ponto no ar (Vercel + Neon)

Mesmo caminho do Esquadrias ([`deploy-vercel-neon.md`](./deploy-vercel-neon.md)):
o app é stateless (sem processo de fundo), então roda em serverless. Banco
no Neon, app na Vercel, fotos no R2 e cobrança no Asaas.

**Por que não na VPS:** é a máquina de 1 vCPU / 2 GB que mantém o WhatsApp
da Believe conectado. Um `next build` ali passa de 1 GB, e se o sistema
derrubar o worker para liberar memória, cliente pagante do Zap fica fora do
ar.

**Custo:** Neon Free serve no começo. A **Vercel Hobby proíbe uso
comercial**; para cobrar cliente, use o plano **Pro (US$ 20/mês)**. Se o
Esquadrias já está num time Pro, o Ponto entra no mesmo time sem custo
extra de assinatura.

Tempo: uns 40 minutos, a maior parte esperando DNS e build.

---

## 0. O código precisa estar na branch que a Vercel publica

O Ponto está na branch `claude/dreamy-dijkstra-yqv8uz`. Faça o merge na
`main` (pull request) **ou** aponte a Vercel para essa branch no passo 4. O
recomendado é o merge: a Vercel publica a `main` em produção.

## 1. Banco no Neon

1. Em <https://console.neon.tech>, crie um projeto **novo** (não reaproveite
   o do Esquadrias: os dados de cada produto ficam separados), região
   **AWS São Paulo (sa-east-1)**.
2. Copie as duas connection strings:
   - **Pooled** (com `-pooler` no host) → vai em `PONTO_DATABASE_URL`
   - **Direct** (sem `-pooler`) → vai em `PONTO_DIRECT_URL`

> ⚠️ O snippet do Neon vem com o nome `DATABASE_URL`. Neste monorepo esse
> nome é do **Zap**. Use `PONTO_DATABASE_URL` e `PONTO_DIRECT_URL`.

## 2. Criar as tabelas (da sua máquina, uma vez)

```bash
git checkout main            # ou a branch do Ponto, se ainda não fez o merge
npm install

export PONTO_DATABASE_URL="<url DIRETA do Neon>"
export PONTO_DIRECT_URL="<a mesma url direta>"

npm run ponto:generate
npm run ponto:deploy         # cria as tabelas E o gatilho que torna a marcação imutável
```

Use **`ponto:deploy`**, nunca `prisma db push`: o `db push` não cria o
gatilho de imutabilidade, e um banco sem ele aceita alteração em registro de
ponto.

**Empresa de demonstração (opcional, para apresentar a clientes):**

```bash
npm run ponto:seed
```

Ela é isenta de cobrança. A senha `ponto123` está publicada neste
repositório: **troque logo no primeiro acesso** (menu → Senha).

## 3. Fotos (R2)

Sem R2, a selfie do registro com foto vai para o Postgres, e o Neon Free (0,5
GB) enche em poucos meses. Use as **mesmas** variáveis `R2_*` do Zap: as
fotos do Ponto ficam no mesmo bucket, sob o prefixo `ponto/`.

## 4. Projeto na Vercel

**Add New → Project** → importe `odilontech-design/dilon-zap`.

| Campo | Valor |
| --- | --- |
| Framework Preset | Next.js |
| **Root Directory** | `apps/ponto` |
| **Include source files outside of the Root Directory** | **ligado** |
| Build / Install Command | padrão |

O "include source files outside" é obrigatório: o app importa
`packages/ponto-db`, `packages/ponto-core` e `packages/storage`.

Em **Settings → Functions → Function Region**, escolha **São Paulo (gru1)**:
fica perto do Neon e o registro de ponto responde mais rápido.

## 5. Variáveis de ambiente

Em **Settings → Environment Variables** (o projeto é só do Ponto, então aqui
os nomes do NextAuth são os padrão):

| Variável | Valor | Ambientes |
| --- | --- | --- |
| `PONTO_DATABASE_URL` | URL **pooled** do Neon | todos |
| `PONTO_DIRECT_URL` | URL **direta** do Neon | todos |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` (NOVO, não o do Zap nem o do Esquadrias) | todos |
| `NEXTAUTH_URL` | `https://ponto.dilontech.com.br` | **só Production** |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | os mesmos do Zap | todos |
| `ASAAS_API_KEY` | a chave da conta Asaas da Dilon (a mesma do Zap) | Production |
| `ASAAS_ENV` | `production` | Production |
| `PONTO_ASAAS_WEBHOOK_TOKEN` | `openssl rand -base64 32` | Production |

Opcionais: `PONTO_TOLERANCIA_DIAS` (padrão 5), `PONTO_DIAS_PRIMEIRO_BOLETO`
(padrão 3), `PONTO_CADASTRO_FECHADO=1` para esconder a contratação pelo site.
**Não** defina `PONTO_ASAAS_URL` em produção: ela só serve para os testes.

Para os ambientes Preview, use a chave do **sandbox** do Asaas com
`ASAAS_ENV=sandbox`, ou deixe sem: sem chave, a contratação funciona e a
tela de assinatura mostra "boleto não gerado".

Depois de salvar: **Deployments → Redeploy**.

## 6. Domínio

**Settings → Domains** → `ponto.dilontech.com.br`. No DNS (Registro.br ou
Cloudflare), crie o registro que a Vercel pedir (normalmente `CNAME` para
`cname.vercel-dns.com`).

## 7. Webhook do Asaas

No Asaas: **Integrações → Webhooks → Adicionar** (é um **segundo** webhook;
o primeiro, do Zap, continua como está):

| Campo | Valor |
| --- | --- |
| URL | `https://ponto.dilontech.com.br/api/webhooks/asaas` |
| Token de autenticação | o mesmo `PONTO_ASAAS_WEBHOOK_TOKEN` |
| Eventos | os de cobrança (`PAYMENT_*`) |
| Fila / versão da API | v3 |

Confira também, em **Configurações → Notificações**, se o email ao cliente
está ligado: é por ele que o boleto chega ao administrador.

## 8. Conferir

```bash
curl -s https://ponto.dilontech.com.br/api/saude
# {"ok":true,"banco":"ok",...}
```

Roteiro de 10 minutos antes de mandar o link para cliente:

1. **Contratação:** abra `/cadastro` e contrate com o CNPJ da própria Dilon.
   - O painel tem que abrir com a faixa "Boleto da mensalidade com
     vencimento em …".
   - A tela **Assinatura** tem que mostrar o boleto e a linha digitável.
   - O boleto aparece no painel do Asaas.
2. **Jornada e colaborador:** cadastre uma jornada e um colaborador com o
   seu CPF. Copie o passo a passo.
3. **Ponto no celular:** abra o link no celular, entre com o CPF, troque a
   senha, permita a localização e registre. Tem que aparecer o comprovante.
4. **Instalação:** use "Adicionar à tela inicial". Tem que abrir como
   aplicativo.
5. **Painel:** confira a marcação no **Controle de ponto** e a sequência
   íntegra em **Configurações**.
6. **Webhook:** no Asaas, cancele (ou receba em dinheiro) o boleto de teste
   e confira se a tela Assinatura atualizou sozinha.

## Atualizar depois

`git push` na branch publicada e a Vercel refaz o deploy. Quando houver
migração nova em `packages/ponto-db/prisma/migrations`, rode **antes** do
deploy:

```bash
export PONTO_DIRECT_URL="<url direta do Neon>"
export PONTO_DATABASE_URL="$PONTO_DIRECT_URL"
npm run ponto:deploy
```

## Se der errado

| Sintoma | Causa provável |
| --- | --- |
| Build falha em "module not found" | "Include source files outside of the Root Directory" desligado |
| `@prisma-ponto/client` não encontrado | Root Directory não é `apps/ponto` (o `prebuild` gera o client) |
| `/api/saude` responde `ok: false` | `PONTO_DATABASE_URL` errada ou migração não rodada (passo 2) |
| Login volta sempre para a tela de login | `NEXTAUTH_SECRET` vazio, ou `NEXTAUTH_URL` diferente do domínio usado |
| Login de um preview vai para o domínio de produção | `NEXTAUTH_URL` marcado em todos os ambientes, e não só em Production |
| Registro falha com "Marcação de ponto é imutável" num script | Funcionando como deveria: correção é ajuste, não UPDATE |
| Boleto não gerado na contratação | `ASAAS_API_KEY`/`ASAAS_ENV` faltando. A mensagem do Asaas aparece na tela Assinatura |
| Pagamento não atualiza sozinho | Webhook não cadastrado ou token diferente. O botão "Já paguei" resolve enquanto isso |
| Câmera ou GPS não abrem no celular | O site precisa estar em **https** (domínio da Vercel ou o próprio), nunca em http |
