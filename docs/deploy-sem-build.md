# Deploy do site sem build na VPS

O build do Next dentro da VPS disputa CPU e memória com o worker do WhatsApp e
já derrubou a sessão de clientes (ver `docs/sdr-piloto.md`). Agora a imagem do
site é construída no GitHub (`.github/workflows/imagem-web.yml`) a cada push na
`main`, e a VPS só baixa e troca o contêiner (`scripts/deploy-web-imagem.sh`).

O worker, o banco e o Caddy não são tocados. O `scripts/deploy-web.sh` antigo
continua no repositório como plano B (GitHub fora do ar), para usar fora do
horário de atendimento.

## Preparação (uma vez só)

1. **Chave de notificações no GitHub.** Repositório → Settings → Secrets and
   variables → Actions → aba **Variables** → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` com o
   MESMO valor do `.env` da VPS. Sem ela o build sai, mas o botão de ativar
   notificações some.
2. **Primeiro build.** Aba Actions → "Imagem do site" → Run workflow (ou o
   próximo push na `main`). Leva ~5 min; termina com a imagem em
   `ghcr.io/odilontech-design/dilon-zap-web:<commit>`.
3. **Acesso da VPS ao registro.** O pacote nasce privado. No GitHub, crie um
   token *classic* só com `read:packages` (Settings → Developer settings →
   Personal access tokens) e, na VPS:
   ```bash
   echo "COLE_O_TOKEN" | docker login ghcr.io -u odilontech-design --password-stdin
   ```
   O token fica em `/root/.docker/config.json` e só serve para baixar imagens.

## Rotina de deploy (sem mudança de banco)

```bash
cd /opt/dilon-zap && git pull origin main
scripts/deploy-web-imagem.sh baixar meu-rotulo   # nada muda no ar
scripts/deploy-web-imagem.sh trocar meu-rotulo   # troca o web, confere o login
```

`baixar` recusa se o build daquele commit ainda não terminou no GitHub — espere
o check verde na aba Actions. `trocar` volta sozinho para a imagem anterior se o
login não responder 200.

Rollback manual: `docker tag dilon-zap-web:antes-<rotulo> dilon-zap-web:latest`
e `docker compose -f docker-compose.prod.yml up -d --no-deps --no-build web`.

## Com mudança de banco

O `db push` vai ENTRE `baixar` e `trocar`, rodando com a imagem nova (que tem o
schema novo) enquanto o site antigo continua no ar. O roteiro de cada mudança
diz o SQL esperado — exemplo completo em `docs/otica.md`.
