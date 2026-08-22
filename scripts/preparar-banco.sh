#!/usr/bin/env bash
# Prepara o banco do SaaS de esquadrias e imprime o que colar na Vercel.
#
# Existe porque a sequência tem duas armadilhas que não dão erro na hora:
#   1. O snippet do Neon usa DATABASE_URL, que neste monorepo é a variável do
#      DILON ZAP — colar como veio faz o Zap apontar pro banco errado.
#   2. São duas URLs quase idênticas (a pooled tem "-pooler" no host). Trocar
#      uma pela outra dá erro só depois: migração travada, ou "too many
#      connections" no primeiro pico de acesso.
#
# Uso:
#   ./scripts/preparar-banco.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo
echo "─── Banco do SaaS de esquadrias ───────────────────────────────────────"
echo
echo "Pegue as DUAS strings no painel do Neon (Connection string):"
echo "  • Pooled  — o host tem \"-pooler\" no meio"
echo "  • Direct  — o mesmo host, sem \"-pooler\""
echo

read -rp "URL POOLED : " URL_POOLED
read -rp "URL DIRETA : " URL_DIRETA
echo

for url in "$URL_POOLED" "$URL_DIRETA"; do
  case "$url" in
    postgres://*|postgresql://*) ;;
    *) echo "✗ \"${url:0:30}...\" não parece uma URL de Postgres." >&2; exit 1 ;;
  esac
done

# A checagem que salva a noite: as duas são quase iguais, e trocá-las só
# aparece como problema depois do deploy.
if [ "$URL_POOLED" = "$URL_DIRETA" ]; then
  echo "⚠  As duas URLs são idênticas. Em Neon elas diferem pelo \"-pooler\" no host."
  read -rp "   Seguir mesmo assim? [s/N] " confirma
  [ "$confirma" = "s" ] || exit 1
elif [[ "$URL_POOLED" != *"-pooler"* ]] || [[ "$URL_DIRETA" == *"-pooler"* ]]; then
  echo "✗ As URLs parecem trocadas:" >&2
  echo "  a POOLED deve conter \"-pooler\" no host, e a DIRETA não." >&2
  exit 1
fi

# Tudo nesta etapa roda pela conexão DIRETA: é migração e carga inicial, que
# não têm por que passar pelo pooler.
export ESQUADRIAS_DATABASE_URL="$URL_DIRETA"
export ESQUADRIAS_DIRECT_URL="$URL_DIRETA"

echo "→ Gerando o Prisma Client…"
npm run erp:generate --silent > /dev/null

echo "→ Criando as tabelas…"
npm run erp:deploy --silent

echo "→ Carregando a empresa de demonstração…"
npm run erp:seed --silent

echo
read -rp "Trocar a senha do login de demonstração agora? [S/n] " trocar
if [ "$trocar" != "n" ] && [ "$trocar" != "N" ]; then
  # -s para não deixar a senha no histórico do terminal nem na tela.
  read -rsp "Nova senha (mínimo 8 caracteres): " NOVA_SENHA
  echo
  npm run erp:senha --silent -- dono@vidracariamodelo.com.br "$NOVA_SENHA"
  LOGIN_SENHA="a que você acabou de definir"
else
  echo "⚠  Seguindo com \"troque-esta-senha\", que está publicada no repositório."
  LOGIN_SENHA="troque-esta-senha"
fi

SEGREDO="$(openssl rand -base64 32)"

cat <<FIM

─── Pronto. Agora, na Vercel ──────────────────────────────────────────────

Settings → Environment Variables. Marque Production, Preview e Development
nas três primeiras; NEXTAUTH_URL vai SÓ em Production.

ESQUADRIAS_DATABASE_URL
$URL_POOLED

ESQUADRIAS_DIRECT_URL
$URL_DIRETA

NEXTAUTH_SECRET
$SEGREDO

NEXTAUTH_URL   (somente Production)
https://esquadrias.dilontech.com.br

E em Settings → General:
  Root Directory ......................... apps/esquadrias
  Include source files outside of the
  Root Directory ......................... ligado

Login da demonstração:
  dono@vidracariamodelo.com.br
  $LOGIN_SENHA

Confira depois do deploy: a janela de 1200 × 1000 mm em branco tem que
fechar em R\$ 1.030,53.
FIM
