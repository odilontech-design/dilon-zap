#!/usr/bin/env bash
# Deploy do site (web) com a imagem pronta do GitHub — SEM build na VPS.
#
# É o deploy-web.sh sem o passo que machuca: em vez de `docker compose build`
# (que disputa CPU e memória com o worker do WhatsApp e já derrubou a sessão de
# clientes), baixa a imagem que o GitHub Actions construiu para o MESMO commit
# que está nesta pasta (.github/workflows/imagem-web.yml).
#
# Uso, na VPS, depois do `git pull origin main`:
#   scripts/deploy-web-imagem.sh baixar <rotulo>   # só baixa; nada muda no ar
#   scripts/deploy-web-imagem.sh trocar <rotulo>   # troca o contêiner web e confere
#
# Dois passos de propósito: quando o deploy mexe no banco, o `db push` roda
# ENTRE eles, com a imagem nova (que tem o schema novo) e o site antigo ainda no
# ar. Ver docs/otica.md. Sem mudança de banco, rode um seguido do outro.
#
# Se o login não responder depois da troca, volta sozinho para a imagem anterior.
#
# Pré-requisito, uma vez só: `docker login ghcr.io` na VPS (ver docs/deploy-sem-build.md).
set -euo pipefail

ACAO="${1:?uso: deploy-web-imagem.sh baixar|trocar <rotulo>}"
ROTULO="${2:?uso: deploy-web-imagem.sh baixar|trocar <rotulo>}"
ROTULO="${ROTULO//[^a-zA-Z0-9._-]/-}"
PROJECT_DIR="${PROJECT_DIR:-/opt/dilon-zap}"
COMPOSE=(docker compose -f "$PROJECT_DIR/docker-compose.prod.yml")
REGISTRO="${REGISTRO:-ghcr.io/odilontech-design/dilon-zap-web}"
MANTER_ROLLBACKS="${MANTER_ROLLBACKS:-2}"
URL_LOGIN="${URL_LOGIN:-https://zap.dilontech.com.br/login}"

cd "$PROJECT_DIR"
COMMIT="$(git rev-parse HEAD)"

case "$ACAO" in
  baixar)
    echo "== $(date -u '+%F %T') UTC — baixar imagem do web: $ROTULO"
    echo "commit nesta pasta: $(git log --oneline -1)"
    # A imagem tem de ser do MESMO commit desta pasta: é com ela que o db push
    # roda, e o schema do banco precisa bater com o código que vai ao ar.
    if ! docker pull "$REGISTRO:$COMMIT"; then
      echo "ABORTADO: não há imagem para $COMMIT. Confira no GitHub (aba Actions) se o build deste commit terminou."
      exit 1
    fi
    if docker image inspect dilon-zap-web:latest >/dev/null 2>&1; then
      docker tag dilon-zap-web:latest "dilon-zap-web:antes-$ROTULO"
      echo "rollback guardado: dilon-zap-web:antes-$ROTULO"
    fi
    # Só a ETIQUETA muda. O contêiner que está no ar continua com a imagem
    # dele até o passo "trocar" — e um restart do Docker também reusa a dele.
    docker tag "$REGISTRO:$COMMIT" dilon-zap-web:latest
    echo "dilon-zap-web:latest agora aponta para $COMMIT (ainda não está no ar)"
    echo "BAIXAR_OK"
    ;;

  trocar)
    echo "== $(date -u '+%F %T') UTC — trocar web: $ROTULO"
    "${COMPOSE[@]}" up -d --no-deps --no-build web
    sleep 15
    CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL_LOGIN" || true)"
    echo "login: HTTP $CODIGO"
    if [ "$CODIGO" != "200" ]; then
      if docker image inspect "dilon-zap-web:antes-$ROTULO" >/dev/null 2>&1; then
        echo "login não respondeu 200 — voltando para dilon-zap-web:antes-$ROTULO"
        docker tag "dilon-zap-web:antes-$ROTULO" dilon-zap-web:latest
        "${COMPOSE[@]}" up -d --no-deps --no-build web
      fi
      echo "FALHOU: confira os logs com: ${COMPOSE[*]} logs --tail 100 web"
      exit 2
    fi
    docker images dilon-zap-web --format '{{.CreatedAt}}|{{.Tag}}' \
      | { grep '|antes-' || true; } | sort -r | cut -d'|' -f2 | tail -n +$((MANTER_ROLLBACKS + 1)) \
      | while read -r tag; do
          echo "removendo rollback antigo: dilon-zap-web:$tag"
          docker rmi "dilon-zap-web:$tag" >/dev/null || true
        done
    # Etiquetas do registro de commits antigos: tirar a etiqueta não apaga a
    # imagem se ela ainda for latest ou antes-* (só some quando ninguém mais a
    # usa). Sem isso, cada deploy deixaria ~1 GB para trás até encher o disco.
    docker images "$REGISTRO" --format '{{.Tag}}' | { grep -vx "$COMMIT" || true; } \
      | while read -r tag; do docker rmi "$REGISTRO:$tag" >/dev/null 2>&1 || true; done
    docker image prune -f >/dev/null || true
    echo "DEPLOY_OK"
    ;;

  *)
    echo "ação desconhecida: $ACAO (use baixar ou trocar)"
    exit 1
    ;;
esac
