# Colocar o SaaS de esquadrias no ar

Runbook para a VPS que já roda o Dilon Zap (`/opt/dilon-zap`). O novo produto
sobe como mais um container no mesmo `docker-compose.prod.yml`, atrás do mesmo
Caddy, usando o mesmo Postgres — **em banco separado**.

Tempo: ~15 minutos, sendo a maior parte espera de build e de DNS.

O Zap continua no ar durante todo o procedimento. Nada aqui recria o container
`web`, o `worker` ou o volume do Postgres.

---

## 1. DNS (faça primeiro — leva alguns minutos pra propagar)

No painel do domínio, crie um registro apontando pro mesmo IP da VPS:

```
Tipo: A     Nome: esquadrias     Valor: <IP da VPS>     Proxy: desligado
```

O proxy do Cloudflare (nuvem laranja) precisa ficar **desligado**, igual ao
`zap`: o Caddy emite o certificado por HTTP-01, e com o proxy ligado o desafio
não chega nele.

Confira antes de seguir:

```bash
dig +short esquadrias.dilontech.com.br
```

Tem que devolver o IP da VPS.

## 2. Atualizar o código na VPS

```bash
ssh -i ~/.ssh/dilon-zap-vps root@<IP da VPS>
cd /opt/dilon-zap

git fetch origin
git checkout claude/saas-vidros-esquadrias-0twgtp   # ou main, depois do merge do PR
git pull
```

## 3. Completar o `.env`

O `.env` da VPS é compartilhado pelos containers. Acrescente as três linhas do
novo produto:

```bash
# gere um segredo NOVO, diferente do NEXTAUTH_SECRET do Zap
openssl rand -base64 32

nano .env
```

```ini
ESQUADRIAS_DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/esquadrias?schema=public"
ESQUADRIAS_NEXTAUTH_URL="https://esquadrias.dilontech.com.br"
ESQUADRIAS_NEXTAUTH_SECRET="<o valor que o openssl gerou>"
```

Use o mesmo usuário e senha que já estão em `POSTGRES_USER` / `POSTGRES_PASSWORD`
no arquivo — é o mesmo servidor Postgres, só outro banco. O host é `postgres`
(nome do serviço na rede do compose), não `localhost`.

**O segredo tem que ser diferente do Zap.** Com o mesmo segredo, um cookie de
sessão de um produto seria aceito pelo outro.

## 4. Criar o banco

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d '"')" \
  -c "CREATE DATABASE esquadrias"
```

Se responder `already exists`, tudo bem — siga.

## 5. Subir o container

```bash
docker compose -f docker-compose.prod.yml up -d --build esquadrias
```

O build leva alguns minutos (instala as dependências e compila o Next). Só o
serviço `esquadrias` é recriado.

Acompanhe:

```bash
docker compose -f docker-compose.prod.yml logs -f esquadrias
```

Esperado: `▲ Next.js 14.2.35` seguido de `✓ Ready`.

## 6. Criar as tabelas

O container já tem o código e as migrações. Rode uma vez:

```bash
docker compose -f docker-compose.prod.yml exec esquadrias npm run erp:deploy
```

Esperado: `All migrations have been successfully applied.`

> `erp:deploy` roda `prisma migrate deploy` — aplica só o que falta e nunca
> apaga coluna sozinho. Não use `erp:push` em produção: ele sincroniza o banco
> com o schema **inclusive removendo** o que não estiver mais lá.

## 7. Criar a primeira empresa

Duas opções.

**Testar com a empresa de demonstração** (catálogo e 6 tipologias prontas, bom
pra conferir que tudo funciona antes de cadastrar cliente real):

```bash
docker compose -f docker-compose.prod.yml exec esquadrias npm run erp:seed
```

Login: `dono@vidracariamodelo.com.br` / `troque-esta-senha` — **troque a senha
em Equipe assim que entrar**, e apague a empresa de demonstração antes de
começar a vender.

**Ou já criar a serralheria real** — pelo `psql`, já que a tela de cadastro de
empresa ainda não existe:

```bash
# gere o hash da senha
docker compose -f docker-compose.prod.yml exec esquadrias \
  node -e 'console.log(require("bcryptjs").hashSync(process.argv[1],10))' 'SENHA-AQUI'
```

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U <POSTGRES_USER> -d esquadrias
```

```sql
INSERT INTO "Empresa" (id, nome, slug, plano, "atualizadoEm")
VALUES ('emp_' || substr(md5(random()::text), 1, 20), 'Nome da Serralheria', 'nome-da-serralheria', 'AVANCADO', now())
RETURNING id;

-- use o id devolvido acima em :empresa_id
INSERT INTO "Usuario" (id, "empresaId", nome, email, "senhaHash", papel)
VALUES ('usr_' || substr(md5(random()::text), 1, 20), ':empresa_id', 'Nome do Dono',
        'email@dominio.com.br', ':hash_do_bcrypt', 'OWNER');
```

A empresa nova começa com o catálogo vazio — perfis, vidros, ferragens, cores e
tipologias são cadastrados por ela em **Catálogo de insumos** e **Tipologias**.

## 8. Ligar o domínio

O `Caddyfile` do repositório já tem o bloco do novo domínio. Recarregue o Caddy
(sem derrubar o Zap):

```bash
docker compose -f docker-compose.prod.yml up -d caddy
docker compose -f docker-compose.prod.yml logs --tail 30 caddy
```

O certificado sai sozinho no primeiro acesso. Se aparecer erro de ACME, quase
sempre é DNS que ainda não propagou ou proxy do Cloudflare ligado.

## 9. Conferir

```bash
curl -sI https://esquadrias.dilontech.com.br/login | head -1   # HTTP/2 200
curl -sI https://zap.dilontech.com.br | head -1                # o Zap continua de pé
```

Entre pelo navegador, faça login e rode o roteiro do
[README do app](../apps/esquadrias/README.md).

## 10. Backup

O `scripts/backup-db.sh` já cobre os dois bancos — assim que
`ESQUADRIAS_DATABASE_URL` existe no `.env`, o próximo cron passa a gerar
`esquadrias-<data>.dump` junto com o `dilonzap-<data>.dump`. Não precisa mexer
no cron.

Force uma execução para confirmar antes de dormir tranquilo:

```bash
/opt/dilon-zap/scripts/backup-db.sh
ls -lh /opt/dilon-zap/backups | tail -4
```

Tem que aparecer um arquivo `esquadrias-*.dump` com tamanho maior que zero.

---

## Atualizar depois (deploy de uma nova versão)

```bash
cd /opt/dilon-zap
git pull
docker compose -f docker-compose.prod.yml up -d --build esquadrias
docker compose -f docker-compose.prod.yml exec esquadrias npm run erp:deploy
```

O `erp:deploy` é inofensivo quando não há migração nova.

## Se der errado

| Sintoma | Causa provável |
| --- | --- |
| Login redireciona pro domínio do Zap | `ESQUADRIAS_NEXTAUTH_URL` ausente ou errado no `.env` |
| `Cannot find module '@prisma-erp/client'` | build antigo em cache — refaça com `--build --no-cache esquadrias` |
| `database "esquadrias" does not exist` | pulou o passo 4 |
| `P1001: Can't reach database server` | host errado na URL: dentro do compose é `postgres`, não `localhost` |
| Tela abre mas o login não aceita a senha | hash gerado com outra senha, ou usuário criado sem `empresaId` válido |
| Caddy não emite certificado | DNS não propagou, ou proxy do Cloudflare ligado |

Voltar atrás sem afetar o Zap:

```bash
docker compose -f docker-compose.prod.yml stop esquadrias
```

O Zap, o worker e o Postgres seguem rodando. O banco `esquadrias` fica intacto
para quando o container voltar.
