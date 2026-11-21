#!/usr/bin/env bash
# Resumo digital (hash) do código-fonte do Dilon Ponto para o registro de
# programa de computador no INPI (e-Software). O INPI não recebe o código:
# recebe só o hash, e a Dilon guarda o pacote que o gerou, sem alterar, para
# provar a autoria se precisar.
#
# Uso, na raiz do monorepo (código já commitado):
#   npm run ponto:hash-inpi
# Saída: dilon-ponto-<versão>-<commit>.tar.gz e o SHA-512 dele.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if ! git diff --quiet HEAD -- apps/ponto packages/ponto-core packages/ponto-db; then
  echo "Há alterações não commitadas no Ponto. Faça o commit antes de gerar o hash." >&2
  exit 1
fi
versao="${PONTO_VERSAO_PROGRAMA:-1.0}"
commit="$(git rev-parse --short HEAD)"
arquivo="dilon-ponto-${versao}-${commit}.tar.gz"
# Pacote reproduzível: mesmo commit → mesmos bytes → mesmo hash.
git archive --format=tar --prefix="dilon-ponto-${versao}/" HEAD \
  apps/ponto packages/ponto-core packages/ponto-db | gzip -n -9 > "$arquivo"
echo "Pacote: $arquivo ($(du -h "$arquivo" | cut -f1))"
echo "SHA-512 (informe no e-Software do INPI):"
sha512sum "$arquivo" | cut -d' ' -f1
