-- Remove do CRM o que o teste de produção do SDR criou para a empresa FICTÍCIA: a negociação (com notas, tarefas e
-- histórico, por cascata) e o contato, se ele nasceu no teste. RODE ESTE ANTES de docs/sdr-limpar-teste.sql, porque o
-- vínculo com a negociação mora no acompanhamento da empresa, que aquele roteiro apaga.
-- Variáveis (psql -v): tid = id da empresa (tenant); marcador = nome fantasia EXATO da empresa fictícia;
-- desde = horário (UTC, AAAA-MM-DD HH:MM:SS) em que o teste começou.
-- Uso: psql -v ON_ERROR_STOP=1 -v tid=... -v marcador=... -v desde=... -f docs/sdr-limpar-teste-crm.sql
--
-- Tudo numa transação, com travas (divisão por zero = para sem apagar nada): exatamente uma empresa com o marcador;
-- a negociação precisa ser do SDR, aberta e criada depois de "desde". O contato só é apagado se nasceu depois de
-- "desde" e não tem outra negociação nem NENHUMA conversa (se você clicou em Enviar no WhatsApp, há conversa e
-- mensagem: o contato fica, e o roteiro avisa quantos ficaram). Não toca em mais nada do CRM.
BEGIN;

SELECT 1 / (CASE WHEN (SELECT count(*) FROM "SdrEmpresa" WHERE "tenantId" = :'tid' AND "nomeFantasia" = :'marcador') = 1 THEN 1 ELSE 0 END) AS uma_empresa_com_o_marcador;

CREATE TEMP TABLE neg AS
  SELECT a."negociacaoId" AS id FROM "SdrAcompanhamento" a JOIN "SdrEmpresa" e ON e.id = a."empresaId"
  WHERE e."tenantId" = :'tid' AND e."nomeFantasia" = :'marcador' AND a."negociacaoId" IS NOT NULL;

SELECT 1 / (CASE WHEN (SELECT count(*) FROM "Negociacao" n WHERE n.id IN (SELECT id FROM neg)
    AND (n."tenantId" <> :'tid' OR n.origem IS DISTINCT FROM 'SDR' OR n.status <> 'ABERTA' OR n."createdAt" < :'desde'::timestamp)) = 0 THEN 1 ELSE 0 END) AS negociacao_do_teste;

CREATE TEMP TABLE cont AS SELECT DISTINCT "contactId" AS id FROM "Negociacao" WHERE id IN (SELECT id FROM neg);

-- Cascata: notas, tarefas, histórico de etapas e itens da negociação.
DELETE FROM "Negociacao" WHERE "tenantId" = :'tid' AND id IN (SELECT id FROM neg);

DELETE FROM "Contact" c
 WHERE c."tenantId" = :'tid' AND c.id IN (SELECT id FROM cont) AND c."createdAt" >= :'desde'::timestamp
   AND NOT EXISTS (SELECT 1 FROM "Negociacao" n WHERE n."contactId" = c.id)
   AND NOT EXISTS (SELECT 1 FROM "Conversation" v WHERE v."contactId" = c.id);

SELECT 1 / (CASE WHEN (SELECT count(*) FROM "Negociacao" WHERE id IN (SELECT id FROM neg)) = 0 THEN 1 ELSE 0 END) AS negociacao_removida;

SELECT 'crm removido' AS resultado, (SELECT count(*) FROM neg) AS negociacoes, (SELECT count(*) FROM "Contact" WHERE id IN (SELECT id FROM cont)) AS contatos_que_ficaram;
COMMIT;
