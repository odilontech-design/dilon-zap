-- Lança no Financeiro as OS históricas (talão de papel) que foram escaneadas
-- ANTES da v1.85.2, quando a OS antiga não gerava conta a receber.
-- Cada uma vira uma conta já QUITADA, com vencimento e recebimento no dia do
-- talão (OrdemServico.createdAt guarda o dia do talão nas históricas), forma
-- dinheiro. Só mexe em OS históricas com valor e sem conta.
--
-- Uso:  psql -v ON_ERROR_STOP=1 -v tenant=otica-visuallis -v fim=COMMIT -f backfill-os-historicas.sql
--   fim=ROLLBACK  -> ensaio: mostra o que faria e desfaz tudo (padrão recomendado antes)
--   fim=COMMIT    -> grava
-- Rodar uma vez: a segunda não acha nada (as OS já têm conta).
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE alvo ON COMMIT DROP AS
SELECT o.id AS ordem_id, o."tenantId" AS tenant_id, o."contactId" AS contact_id, o.numero,
       o."valorCents" AS valor, o."createdAt" AS dia,
       'cs' || substr(md5(random()::text || clock_timestamp()::text || o.id), 1, 23) AS conta_id,
       'cp' || substr(md5(random()::text || clock_timestamp()::text || o.id), 1, 23) AS parcela_id,
       'cg' || substr(md5(random()::text || clock_timestamp()::text || o.id), 1, 23) AS pagamento_id,
       coalesce(nullif(initcap(split_part(trim(coalesce(c.name, c."waName", '')), ' ', 1)), ''), '') AS primeiro_nome
FROM "OrdemServico" o
JOIN "Tenant" t ON t.id = o."tenantId"
JOIN "Contact" c ON c.id = o."contactId"
WHERE t.slug = :'tenant' AND o.historica AND o."valorCents" > 0 AND o."contaId" IS NULL
  AND o."createdAt" < date_trunc('month', now());  -- o dia do talão nunca é do mês corrente

\echo '== OS que vão ser lançadas (dia do talão, valor)'
SELECT lpad(numero::text, 4, '0') AS os, to_char(dia, 'YYYY-MM-DD') AS dia_do_talao, valor / 100.0 AS reais FROM alvo ORDER BY dia;

INSERT INTO "ContaReceber" (id, "tenantId", "contactId", origem, descricao, "categoriaId", "createdAt")
SELECT a.conta_id, a.tenant_id, a.contact_id, 'MANUAL',
       'OS ' || lpad(a.numero::text, 4, '0') || CASE WHEN a.primeiro_nome <> '' THEN ' · ' || a.primeiro_nome ELSE '' END || ' (talão antigo)',
       (SELECT id FROM "CategoriaFinanceira" k WHERE k."tenantId" = a.tenant_id AND k.tipo = 'RECEITA' AND k.nome = 'Vendas de mercadorias' AND k.ativa LIMIT 1),
       a.dia
FROM alvo a;

INSERT INTO "Parcela" (id, "tenantId", "contaId", numero, "totalParcelas", tipo, vencimento, "valorCents")
SELECT a.parcela_id, a.tenant_id, a.conta_id, 1, 1, 'UNICA', a.dia, a.valor FROM alvo a;

INSERT INTO "Pagamento" (id, "contaId", "parcelaId", "valorCents", meio, "recebidoEm", observacao, "createdAt")
SELECT a.pagamento_id, a.conta_id, a.parcela_id, a.valor, 'DINHEIRO', a.dia,
       'OS ' || lpad(a.numero::text, 4, '0') || ': talão antigo, recebido na data do talão', a.dia
FROM alvo a;

UPDATE "OrdemServico" o SET "contaId" = a.conta_id FROM alvo a WHERE o.id = a.ordem_id;

\echo '== Conferência: por mês do recebimento (esperado: soma = valor das OS acima)'
SELECT to_char(p."recebidoEm", 'YYYY-MM') AS mes, count(*) AS pagamentos, sum(p."valorCents") / 100.0 AS reais
FROM "Pagamento" p JOIN alvo a ON a.pagamento_id = p.id GROUP BY 1 ORDER BY 1;

:fim;
