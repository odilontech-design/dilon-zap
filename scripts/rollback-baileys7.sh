#!/usr/bin/env bash
# Volta o worker pro Baileys 6.7.24 se a 7.x se comportar pior.
#
# Rodar NA VPS: bash /opt/dilon-zap/scripts/rollback-baileys7.sh
#
# Restaura DUAS coisas, e a ordem importa: primeiro o estado de autenticação,
# depois a imagem antiga. O estado do Signal fica no Postgres, e a 7.x escreve
# categorias que a 6.x não conhece (lid-mapping, device-list) além de poder
# mexer no formato das existentes — trocar só a imagem deixaria a 6.x lendo um
# estado que ela não sabe interpretar, que é pior que o problema original.
set -euo pipefail

cd /opt/dilon-zap

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP=$(ls -t backups/auth-state-*.dump 2>/dev/null | head -1) || true
fi
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "Backup do estado de autenticação não encontrado." >&2; exit 1; }

echo "Vai restaurar: $DUMP"
echo "E voltar a imagem dilon-zap-worker:antes-do-log-filtrado"
read -r -p "Confirma? (digite SIM) " ok
[ "$ok" = "SIM" ] || { echo "abortado"; exit 1; }

echo "1/4 parando o worker (pra ele não escrever durante a restauração)"
docker compose -f docker-compose.prod.yml stop worker

echo "2/4 restaurando WhatsAppSession e WhatsAppSignalKey"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U dilonzap -d dilonzap --clean --if-exists --no-owner < "$DUMP"

echo "3/4 voltando o código pro commit anterior à migração"
git checkout 916446e -- apps/worker/package.json package-lock.json apps/worker/src/session-manager.ts

echo "4/4 reconstruindo o worker na 6.7.24"
docker compose -f docker-compose.prod.yml up -d --build worker

echo
echo "Pronto. Confira:"
echo "  docker compose -f docker-compose.prod.yml logs worker --tail 30"
echo "  status das sessões no painel admin"
echo
echo "Se as sessões não voltarem sozinhas, o pareamento precisa ser refeito"
echo "pelo QR em /connect — o estado restaurado é o de $DUMP."
