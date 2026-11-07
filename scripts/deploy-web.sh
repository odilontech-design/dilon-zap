#!/usr/bin/env bash
# Deploy do site (web) SEM mexer no worker do WhatsApp nem no banco.
#
# Uso, na VPS, depois do `git pull origin main`:
#   nohup scripts/deploy-web.sh <rotulo> > /tmp/deploy-web.log 2>&1 &
# e acompanhar com `tail -f /tmp/deploy-web.log` (o build leva minutos; rodar em
# segundo plano evita perder o deploy se o SSH cair).
#
# O que faz, nesta ordem:
#   1. recusa começar com pouco disco (um build sem espaço falha no fim, depois
#      de minutos, ao gravar a imagem);
#   2. guarda a imagem em uso como `dilon-zap-web:antes-<rotulo>` (rollback);
#   3. constrói a imagem nova — se falhar, o site antigo continua no ar;
#   4. troca só o contêiner web e confere se o login responde;
#   5. mantém só as 2 últimas imagens de rollback e apaga o cache de build com
#      mais de 3 dias sem uso. Foi o acúmulo disso que encheu o disco da VPS.
#
# Rollback: docker tag dilon-zap-web:antes-<rotulo> dilon-zap-web:latest
#           docker compose -f docker-compose.prod.yml up -d --no-deps --no-build web
set -euo pipefail

ROTULO="${1:?uso: deploy-web.sh <rotulo>  (ex.: excluir-empresa)}"
ROTULO="${ROTULO//[^a-zA-Z0-9._-]/-}"
PROJECT_DIR="${PROJECT_DIR:-/opt/dilon-zap}"
COMPOSE=(docker compose -f "$PROJECT_DIR/docker-compose.prod.yml")
MIN_LIVRE_GB="${MIN_LIVRE_GB:-4}"
MANTER_ROLLBACKS="${MANTER_ROLLBACKS:-2}"
URL_LOGIN="${URL_LOGIN:-https://zap.dilontech.com.br/login}"

cd "$PROJECT_DIR"

livre_gb() { df -BG --output=avail / | tail -1 | tr -dc '0-9'; }

echo "== $(date -u '+%F %T') UTC — deploy do web: $ROTULO"
echo "commit: $(git log --oneline -1)"

LIVRE="$(livre_gb)"
echo "disco livre: ${LIVRE} GB"
if [ "$LIVRE" -lt "$MIN_LIVRE_GB" ]; then
  echo "ABORTADO: menos de ${MIN_LIVRE_GB} GB livres. Apague imagens antigas (docker images) e tente de novo."
  exit 1
fi

docker tag dilon-zap-web:latest "dilon-zap-web:antes-$ROTULO"
echo "rollback guardado: dilon-zap-web:antes-$ROTULO"

"${COMPOSE[@]}" build web
echo "build concluído"

"${COMPOSE[@]}" up -d --no-deps --no-build web
sleep 15

CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL_LOGIN" || true)"
echo "login: HTTP $CODIGO"
if [ "$CODIGO" != "200" ]; then
  echo "ATENÇÃO: o login não respondeu 200. Rollback: docker tag dilon-zap-web:antes-$ROTULO dilon-zap-web:latest && ${COMPOSE[*]} up -d --no-deps --no-build web"
  exit 2
fi

# Poda: só tags antes-* do web, da mais nova para a mais antiga; sobram as N primeiras.
docker images dilon-zap-web --format '{{.CreatedAt}}|{{.Tag}}' \
  | { grep '|antes-' || true; } | sort -r | cut -d'|' -f2 | tail -n +$((MANTER_ROLLBACKS + 1)) \
  | while read -r tag; do
      echo "removendo rollback antigo: dilon-zap-web:$tag"
      docker rmi "dilon-zap-web:$tag" >/dev/null || true
    done
docker builder prune -f --filter unused-for=72h >/dev/null || true

echo "disco livre agora: $(livre_gb) GB"
echo "DEPLOY_OK"
