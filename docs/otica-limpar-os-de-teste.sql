-- Remove as OS de teste da Ótica (499 a 502) com a venda delas, para a numeração
-- do sistema poder voltar a 0498. Rodar na VPS, no psql do banco, DEPOIS de fazer
-- backup, e só depois de conferir o resultado dos SELECT da parte 1.
--
-- Trocar :tenant pelo id da empresa da Visuallis e a lista de números se for outra.
--   \set tenant '''ID_DA_EMPRESA'''
--
-- A parte 2 roda dentro de uma transação que termina em ROLLBACK. Para valer,
-- troque o ROLLBACK por COMMIT depois de conferir as contagens que ela imprime.

-- PARTE 1: só leitura. Confira que são mesmo as OS de teste.
SELECT o.numero, o.etapa, o."createdAt", c.name AS cliente, o."valorCents", o."sinalCents",
       o."contaId", o."armacaoEstoqueId"
FROM "OrdemServico" o JOIN "Contact" c ON c.id = o."contactId"
WHERE o."tenantId" = :tenant AND o.numero BETWEEN 499 AND 502
ORDER BY o.numero;

-- Pagamentos que saem do Caixa junto com as contas (o valor some do dia):
SELECT o.numero, p."recebidoEm", p."valorCents", p.meio
FROM "OrdemServico" o JOIN "Pagamento" p ON p."contaId" = o."contaId"
WHERE o."tenantId" = :tenant AND o.numero BETWEEN 499 AND 502
ORDER BY o.numero, p."recebidoEm";

-- Movimentos de estoque dessas OS (venda -1, estorno +1). O saldo da armação volta ao que era:
SELECT o.numero, a.codigo, a.descricao, m.tipo, m.quantidade, a.quantidade AS saldo_atual
FROM "MovimentoArmacao" m
JOIN "OrdemServico" o ON o.id = m."ordemId"
JOIN "Armacao" a ON a.id = m."armacaoId"
WHERE o."tenantId" = :tenant AND o.numero BETWEEN 499 AND 502
ORDER BY o.numero, m."createdAt";

-- PARTE 2: apaga. Parcelas e pagamentos saem junto da conta (cascata); os eventos saem junto da OS.
BEGIN;

-- 2.1 Desfaz o efeito dos movimentos no saldo das armações e apaga esses movimentos.
UPDATE "Armacao" a SET quantidade = a.quantidade - x.soma
FROM (
  SELECT m."armacaoId", SUM(m.quantidade) AS soma
  FROM "MovimentoArmacao" m
  JOIN "OrdemServico" o ON o.id = m."ordemId"
  WHERE o."tenantId" = :tenant AND o.numero BETWEEN 499 AND 502
  GROUP BY m."armacaoId"
) x WHERE a.id = x."armacaoId";
DELETE FROM "MovimentoArmacao"
WHERE "ordemId" IN (SELECT id FROM "OrdemServico" WHERE "tenantId" = :tenant AND numero BETWEEN 499 AND 502);

-- 2.2 Apaga as contas a receber das OS (e com elas parcelas e pagamentos).
DELETE FROM "ContaReceber"
WHERE id IN (SELECT "contaId" FROM "OrdemServico"
             WHERE "tenantId" = :tenant AND numero BETWEEN 499 AND 502 AND "contaId" IS NOT NULL);

-- 2.3 Apaga as OS (e os eventos).
DELETE FROM "OrdemServico" WHERE "tenantId" = :tenant AND numero BETWEEN 499 AND 502;

-- 2.4 Volta o contador da numeração.
UPDATE "OticaConfig" SET "proximoNumeroOS" = 498 WHERE "tenantId" = :tenant;

-- Confira antes de decidir:
SELECT count(*) AS os_restantes_499_502 FROM "OrdemServico" WHERE "tenantId" = :tenant AND numero BETWEEN 499 AND 502;
SELECT "proximoNumeroOS" FROM "OticaConfig" WHERE "tenantId" = :tenant;

ROLLBACK;  -- troque por COMMIT para valer
