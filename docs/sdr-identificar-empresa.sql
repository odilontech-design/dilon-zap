-- Descobre o id e o slug da empresa que vai receber o SDR. SOMENTE LEITURA.
-- Nome não identifica uma empresa (há nomes repetidos): use o id e o slug daqui nos
-- roteiros docs/sdr-ativar-recurso.sql e docs/sdr-desativar-recurso.sql.
--
-- Uso, na VPS, na pasta /opt/dilon-zap:
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < docs/sdr-identificar-empresa.sql
--
-- Conferir na saída: UMA empresa com o nome certo, e pelo menos um usuário Responsável (OWNER)
-- ou Superadmin ativo. Esses dois papéis escrevem no SDR; Financeiro só lê; Atendente não acessa.
BEGIN TRANSACTION READ ONLY;

SELECT t.id, t.slug, t.name AS empresa, u.name AS usuario, u.role
FROM "Tenant" t JOIN "User" u ON u."tenantId" = t.id
WHERE t.name LIKE 'Dilon Tech%' AND u."deactivatedAt" IS NULL
ORDER BY t.name, u.role, u.name;

-- Todas as empresas, para ver nomes repetidos e confirmar que não há outra "Dilon Tech".
SELECT id, slug, name FROM "Tenant" ORDER BY name;

-- Linhas de recurso que já existem (o SDR não deve aparecer ainda).
SELECT "tenantId", recurso, ativo FROM "TenantRecurso" ORDER BY "tenantId", recurso;

ROLLBACK;
