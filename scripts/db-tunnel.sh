#!/usr/bin/env bash
# Túnel SSH pro Postgres de produção, pra rodar o app local contra os dados
# reais.
#
# Por que existe: depois que o banco saiu do Neon pra VPS, o .env local
# continuou apontando pro Neon. O dev local passou a ler uma cópia congelada
# no dia da migração — e isso não dá erro nenhum, o app sobe normal e mostra
# dados plausíveis, só velhos. Levou um tempo até alguém perceber.
#
# O Postgres não publica porta no host de propósito (só `expose`, fica na rede
# interna do Docker). Então o túnel aponta pro IP do CONTAINER, resolvido a
# cada execução: esse IP muda toda vez que o container é recriado, e fixar
# levaria a um túnel que conecta em silêncio no lugar errado.
set -euo pipefail

VPS="${DILON_VPS:-root@178.104.197.156}"
CHAVE="${DILON_VPS_KEY:-$HOME/.ssh/dilon-zap-vps}"
PORTA_LOCAL="${1:-5433}"

echo "Resolvendo o IP do container postgres..."
IP=$(ssh -i "$CHAVE" -o ConnectTimeout=20 "$VPS" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dilon-zap-postgres-1") || {
  echo "Não consegui falar com a VPS. O container postgres está de pé?" >&2
  exit 1
}
IP=$(echo "$IP" | tr -d '\r\n')
[ -n "$IP" ] || { echo "Container postgres sem IP — está rodando?" >&2; exit 1; }

echo "Container em $IP. Abrindo túnel localhost:$PORTA_LOCAL -> postgres:5432"
echo
echo "  Use no .env:"
echo "  DATABASE_URL=\"postgresql://dilonzap:<senha>@localhost:$PORTA_LOCAL/dilonzap?sslmode=disable\""
echo "  (a senha está em POSTGRES_PASSWORD no .env da VPS)"
echo
echo "  ATENÇÃO: isto é o banco de PRODUÇÃO. Qualquer coisa que o app local"
echo "  gravar afeta o atendimento de verdade — inclusive mensagem enviada"
echo "  pelo Inbox, que vai parar no WhatsApp do cliente."
echo
echo "Ctrl+C encerra o túnel."

exec ssh -i "$CHAVE" -N -L "$PORTA_LOCAL:$IP:5432" "$VPS"
