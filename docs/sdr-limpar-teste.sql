-- Remove a empresa FICTÍCIA usada no teste de produção do SDR e tudo o que nasceu dela.
-- Variáveis (psql -v): tid = id da empresa (tenant); marcador = nome fantasia EXATO da empresa fictícia;
-- desde = horário (UTC, AAAA-MM-DD HH:MM:SS) em que o teste começou.
-- Uso: psql -v ON_ERROR_STOP=1 -v tid=... -v marcador=... -v desde=... -f docs/sdr-limpar-teste.sql
--
-- Tudo numa transação, com travas: se houver mais de uma empresa com o marcador, se o cadastro de origem não
-- for um cadastro manual de uma linha só, ou se sobrar qualquer rastro, o roteiro para com erro (divisão por
-- zero) e NADA é apagado. Não toca em contatos, negociações, mensagens, bloqueios nem em outras empresas.
-- Fica de propósito: o registro de auditoria (AuditLog) das ações do teste.
BEGIN;

SELECT 1 / (CASE WHEN (SELECT count(*) FROM "SdrEmpresa" WHERE "tenantId" = :'tid' AND "nomeFantasia" = :'marcador') = 1 THEN 1 ELSE 0 END) AS uma_empresa_com_o_marcador;

CREATE TEMP TABLE alvo AS SELECT id FROM "SdrEmpresa" WHERE "tenantId" = :'tid' AND "nomeFantasia" = :'marcador';
CREATE TEMP TABLE imp AS SELECT DISTINCT "importacaoId" AS id FROM "SdrImportacaoLinha" WHERE "tenantId" = :'tid' AND "empresaId" IN (SELECT id FROM alvo);

-- Só apaga a importação que serviu apenas a esta empresa: cadastro manual, uma linha.
SELECT 1 / (CASE WHEN (SELECT count(*) FROM "SdrImportacao" i WHERE i.id IN (SELECT id FROM imp) AND (i."tenantId" <> :'tid' OR i."totalLinhas" <> 1 OR i."nomeArquivo" <> 'cadastro-manual.csv')) = 0 THEN 1 ELSE 0 END) AS importacao_so_desta_empresa;

DELETE FROM "SdrTrabalho" WHERE "tenantId" = :'tid' AND payload->>'importacaoId' IN (SELECT id FROM imp);
-- Cascata: as linhas da importação.
DELETE FROM "SdrImportacao" WHERE "tenantId" = :'tid' AND id IN (SELECT id FROM imp);
-- Cascata: prospectos, acompanhamento, abordagens e interações da empresa.
DELETE FROM "SdrEmpresa" WHERE "tenantId" = :'tid' AND id IN (SELECT id FROM alvo);
-- Chamadas de IA recusadas durante o teste (IA desligada). Nada além disso.
DELETE FROM "SdrIaUso" WHERE "tenantId" = :'tid' AND status = 'BLOQUEADO' AND tarefa = 'abordagem_comercial' AND "createdAt" >= :'desde'::timestamp;

-- Conferência: não pode sobrar nada ligado à empresa nem à importação.
SELECT 1 / (CASE WHEN
    (SELECT count(*) FROM "SdrEmpresa" WHERE id IN (SELECT id FROM alvo))
  + (SELECT count(*) FROM "SdrProspecto" WHERE "empresaId" IN (SELECT id FROM alvo))
  + (SELECT count(*) FROM "SdrAcompanhamento" WHERE "empresaId" IN (SELECT id FROM alvo))
  + (SELECT count(*) FROM "SdrAbordagem" WHERE "empresaId" IN (SELECT id FROM alvo))
  + (SELECT count(*) FROM "SdrInteracao" WHERE "empresaId" IN (SELECT id FROM alvo))
  + (SELECT count(*) FROM "SdrImportacaoLinha" WHERE "empresaId" IN (SELECT id FROM alvo) OR "importacaoId" IN (SELECT id FROM imp))
  + (SELECT count(*) FROM "SdrImportacao" WHERE id IN (SELECT id FROM imp))
  = 0 THEN 1 ELSE 0 END) AS nada_sobrou;

SELECT 'removido' AS resultado, (SELECT count(*) FROM alvo) AS empresas, (SELECT count(*) FROM imp) AS importacoes;
COMMIT;
