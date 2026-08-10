#!/usr/bin/env bash
# Backup diário do Postgres que roda no próprio VPS.
#
# Enquanto o banco era gerenciado (Neon), backup era problema do provedor.
# Com o banco aqui dentro, uma falha de disco levaria tudo — por isso esse
# script guarda uma cópia local com retenção e manda a mesma cópia pro R2,
# que é onde as mídias já vivem (ou seja: fora deste servidor).
#
# Instalado no cron do host — ver README/deploy. Uso manual:
#   /opt/dilon-zap/scripts/backup-db.sh
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/dilon-zap}"
BACKUP_DIR="$PROJECT_DIR/backups"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="dilonzap-$STAMP.dump"

cd "$PROJECT_DIR"
# shellcheck disable=SC1091
set -a; source .env; set +a

mkdir -p "$BACKUP_DIR"

# -Fc (custom) em vez de SQL puro: comprime e permite restaurar tabela a
# tabela com pg_restore se algum dia for preciso recuperar só parte.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP_DIR/$FILE"

# Backup vazio/truncado é pior que backup nenhum, porque passa falsa
# segurança — confere que o arquivo tem conteúdo e que o pg_restore
# consegue lê-lo antes de considerar o backup válido.
if [ ! -s "$BACKUP_DIR/$FILE" ]; then
  echo "[backup-db] ERRO: dump saiu vazio, abortando" >&2
  rm -f "$BACKUP_DIR/$FILE"
  exit 1
fi
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -l "/backups/$FILE" > /dev/null

echo "[backup-db] ok: $FILE ($(du -h "$BACKUP_DIR/$FILE" | cut -f1))"

# Cópia fora do servidor. Sem isso o backup morre junto com o disco.
if command -v aws >/dev/null 2>&1 && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION=auto \
  aws s3 cp "$BACKUP_DIR/$FILE" "s3://$R2_BUCKET_NAME/backups/$FILE" \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    && echo "[backup-db] enviado pro R2" \
    || echo "[backup-db] AVISO: falhou o envio pro R2 (cópia local está ok)" >&2
else
  echo "[backup-db] AVISO: aws cli ausente — só há cópia local" >&2
fi

# Retenção: mantém as últimas duas semanas e apaga o resto, senão o disco
# do VPS enche sozinho com o tempo.
find "$BACKUP_DIR" -name 'dilonzap-*.dump' -mtime "+$RETENTION_DAYS" -delete
echo "[backup-db] retenção aplicada (mantendo $RETENTION_DAYS dias)"
