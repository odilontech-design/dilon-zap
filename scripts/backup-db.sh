#!/usr/bin/env bash
# Backup diário do Postgres que roda no próprio VPS.
#
# Enquanto o banco era gerenciado (Neon), backup era problema do provedor.
# Com o banco aqui dentro, uma falha de disco levaria tudo — por isso esse
# script guarda uma cópia local com retenção e manda a mesma cópia pro R2,
# que é onde as mídias já vivem (ou seja: fora deste servidor).
#
# São DOIS bancos no mesmo Postgres: o do Dilon Zap e o do SaaS de esquadrias.
# Cada um é dumpado separado, porque são produtos vendidos separados —
# restaurar um não pode obrigar a restaurar o outro junto.
#
# Instalado no cron do host — ver README/deploy. Uso manual:
#   /opt/dilon-zap/scripts/backup-db.sh
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/dilon-zap}"
BACKUP_DIR="$PROJECT_DIR/backups"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$PROJECT_DIR"
# shellcheck disable=SC1091
set -a; source .env; set +a

mkdir -p "$BACKUP_DIR"

# Dumpa um banco e valida o arquivo. Recebe (nome_do_banco, prefixo_do_arquivo)
# porque o mesmo cuidado — conferir que não saiu vazio e que o pg_restore
# consegue ler — vale igual para os dois produtos.
dump_banco() {
  local banco="$1"
  local prefixo="$2"
  local arquivo="$prefixo-$STAMP.dump"

  # -Fc (custom) em vez de SQL puro: comprime e permite restaurar tabela a
  # tabela com pg_restore se algum dia for preciso recuperar só parte.
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$banco" -Fc > "$BACKUP_DIR/$arquivo"

  # Backup vazio/truncado é pior que backup nenhum, porque passa falsa
  # segurança — confere que o arquivo tem conteúdo e que o pg_restore
  # consegue lê-lo antes de considerar o backup válido.
  if [ ! -s "$BACKUP_DIR/$arquivo" ]; then
    echo "[backup-db] ERRO: dump de $banco saiu vazio, abortando" >&2
    rm -f "$BACKUP_DIR/$arquivo"
    return 1
  fi
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_restore -l "/backups/$arquivo" > /dev/null

  echo "[backup-db] ok: $arquivo ($(du -h "$BACKUP_DIR/$arquivo" | cut -f1))"
  enviar_pro_r2 "$arquivo"
}

# Cópia fora do servidor. Sem isso o backup morre junto com o disco.
enviar_pro_r2() {
  local arquivo="$1"
  if command -v aws >/dev/null 2>&1 && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto \
    aws s3 cp "$BACKUP_DIR/$arquivo" "s3://$R2_BUCKET_NAME/backups/$arquivo" \
      --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
      && echo "[backup-db] $arquivo enviado pro R2" \
      || echo "[backup-db] AVISO: falhou o envio de $arquivo pro R2 (cópia local está ok)" >&2
  else
    echo "[backup-db] AVISO: aws cli ausente — só há cópia local de $arquivo" >&2
  fi
}

dump_banco "$POSTGRES_DB" "dilonzap"

# O banco de esquadrias só existe depois que o segundo produto sobe. Enquanto
# ESQUADRIAS_DATABASE_URL não estiver no .env, o backup segue cuidando só do
# Zap em vez de falhar o cron inteiro.
if [ -n "${ESQUADRIAS_DATABASE_URL:-}" ]; then
  # Extrai o nome do banco da URL (o trecho depois da última barra, sem a
  # query string). Ler do .env evita um segundo lugar pra manter em sincronia.
  BANCO_ESQUADRIAS="${ESQUADRIAS_DATABASE_URL##*/}"
  BANCO_ESQUADRIAS="${BANCO_ESQUADRIAS%%\?*}"
  dump_banco "$BANCO_ESQUADRIAS" "esquadrias"
else
  echo "[backup-db] ESQUADRIAS_DATABASE_URL ausente — pulando o banco de esquadrias"
fi

# Retenção: mantém as últimas duas semanas e apaga o resto, senão o disco
# do VPS enche sozinho com o tempo.
find "$BACKUP_DIR" -name 'dilonzap-*.dump' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'esquadrias-*.dump' -mtime "+$RETENTION_DAYS" -delete
echo "[backup-db] retenção aplicada (mantendo $RETENTION_DAYS dias)"
