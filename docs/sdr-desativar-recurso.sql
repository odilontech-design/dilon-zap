-- Desliga o SDR de uma empresa APAGANDO a linha (não basta marcar como inativa).
-- Motivo: o site antigo não conhece o valor SDR do enum e quebra ao ler a linha, ativa ou não.
-- Por isso, para voltar a imagem antiga do site, rode este arquivo ANTES de trocar a imagem.
--
-- Uso, na VPS, na pasta /opt/dilon-zap:
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v tid=ID_DA_EMPRESA' \
--     < docs/sdr-desativar-recurso.sql
BEGIN;

DELETE FROM "TenantRecurso" WHERE recurso = 'SDR' AND "tenantId" = :'tid';

SELECT count(*) AS linhas_sdr_restantes FROM "TenantRecurso" WHERE recurso = 'SDR';

COMMIT;
