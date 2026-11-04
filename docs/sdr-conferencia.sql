-- Conferência do piloto. SOMENTE LEITURA: a transação abaixo recusa qualquer escrita.
--
-- Uso, na VPS, na pasta /opt/dilon-zap:
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < docs/sdr-conferencia.sql
-- Rode uma vez ANTES de importar e outra DEPOIS: o bloco 1 tem de ser igual nas duas.
BEGIN TRANSACTION READ ONLY;

-- 1. CRM e WhatsApp: nada disto pode mudar por causa do SDR.
SELECT (SELECT count(*) FROM "Contact") AS contatos,
       (SELECT count(*) FROM "Conversation") AS conversas,
       (SELECT count(*) FROM "Message") AS mensagens,
       (SELECT count(*) FROM "ScheduledMessage") AS agendadas,
       (SELECT count(*) FROM "Negociacao") AS negociacoes;

-- 2. Empresas duplicadas pelo mesmo CNPJ: deve devolver 0 linhas.
SELECT "tenantId", cnpj, count(*) AS vezes FROM "SdrEmpresa" WHERE cnpj IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;

-- 3. Resultado de cada importação.
SELECT "nomeArquivo", status, "totalLinhas", importadas, atualizadas, duplicadas, invalidas, falhas, pendentes, "createdAt"
FROM "SdrImportacao" ORDER BY "createdAt" DESC LIMIT 20;

-- 4. Situação das linhas: nenhuma deve ficar PENDENTE depois de concluída, e FALHOU precisa de explicação.
SELECT status, count(*) AS linhas FROM "SdrImportacaoLinha" GROUP BY status ORDER BY status;

-- 5. Fila: nada preso em EM_PROCESSAMENTO e nada FALHOU sem explicação.
SELECT tipo, status, tentativas, "maxTentativas", left(erro, 80) AS erro, "createdAt"
FROM "SdrTrabalho" ORDER BY "createdAt" DESC LIMIT 20;

-- 6. Prospectos por campanha e situação.
SELECT c.nome AS campanha, p.status, count(*) AS prospectos, round(avg(p.pontuacao)) AS pontuacao_media
FROM "SdrProspecto" p JOIN "SdrCampanha" c ON c.id = p."campanhaId" GROUP BY 1, 2 ORDER BY 1, 2;

-- 7. Isolamento: só a empresa do piloto tem o recurso e só ela tem dados.
SELECT t.name, t.slug, r.recurso, r.ativo FROM "TenantRecurso" r JOIN "Tenant" t ON t.id = r."tenantId" WHERE r.recurso = 'SDR';
SELECT t.name, count(*) AS empresas_sdr FROM "SdrEmpresa" e JOIN "Tenant" t ON t.id = e."tenantId" GROUP BY 1;

-- 8. Empresas bloqueadas pela lista de supressão (por CNPJ).
SELECT e."razaoSocial", e.cnpj, s.motivo FROM "SdrEmpresa" e JOIN "SdrSupressao" s
  ON s."tenantId" = e."tenantId" AND s.tipo = 'CNPJ' AND s.valor = e.cnpj;

ROLLBACK;
