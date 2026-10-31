-- Liga o SDR para UMA empresa, a Dilon Tech. Rode SÓ depois de o site novo estar no ar
-- (o site antigo não conhece o valor SDR do enum e quebraria ao ler esta linha).
--
-- Antes: descubra o id e o slug da empresa com a consulta de leitura do roteiro
-- (docs/sdr-piloto.md, passo 8). Nome não serve para identificar: há nomes repetidos.
--
-- Uso, na VPS, na pasta /opt/dilon-zap:
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v tid=ID_DA_EMPRESA -v slug=SLUG_DA_EMPRESA' \
--     < docs/sdr-ativar-recurso.sql
--
-- Garantias:
--   * só insere para a empresa cujo id E slug batem (erro de digitação não liga outra);
--   * nunca sobrescreve: se a linha já existir, fica como está;
--   * a conferência final falha, e a transação inteira é desfeita, se não houver
--     exatamente UMA linha SDR no banco, ativa, e ela não for a da empresa informada.
BEGIN;

INSERT INTO "TenantRecurso" ("tenantId", recurso, ativo, motivo, "updatedAt")
SELECT id, 'SDR', true, 'Piloto interno do SDR', now()
FROM "Tenant"
WHERE id = :'tid' AND slug = :'slug'
ON CONFLICT ("tenantId", recurso) DO NOTHING;

SELECT t.id, t.name, t.slug, r.recurso, r.ativo, r.motivo
FROM "TenantRecurso" r JOIN "Tenant" t ON t.id = r."tenantId"
WHERE r.recurso = 'SDR';

SELECT 1 / (CASE
  WHEN (SELECT count(*) FROM "TenantRecurso" WHERE recurso = 'SDR') = 1
   AND EXISTS (SELECT 1 FROM "TenantRecurso" WHERE recurso = 'SDR' AND "tenantId" = :'tid' AND ativo)
  THEN 1 ELSE 0 END) AS conferido;

COMMIT;
