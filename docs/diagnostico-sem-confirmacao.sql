-- Diagnóstico de "sem confirmação" no Inbox.
--
-- "sem confirmação" na tela = mensagem OUTBOUND que ficou em SENT por mais de
-- 10 minutos: o WhatsApp nunca mandou o recibo de entrega. Isso tem três
-- causas possíveis, e estas consultas servem pra separar uma da outra antes
-- de mexer em qualquer coisa.
--
-- Rodar no banco do cliente, uma de cada vez. São todas de leitura.

-- 1. O tamanho do problema, por número conectado e por dia.
--    Se a proporção de "presas" for alta e crescente, não é coincidência de
--    cliente com celular desligado.
SELECT s.id                                   AS sessao,
       s."phoneNumber",
       date_trunc('day', m."createdAt")::date AS dia,
       count(*)                               AS enviadas,
       count(*) FILTER (WHERE m.status = 'SENT'
                        AND m."createdAt" < now() - interval '10 minutes') AS presas_em_sent,
       round(100.0 * count(*) FILTER (WHERE m.status = 'SENT'
                        AND m."createdAt" < now() - interval '10 minutes') / count(*), 1) AS pct
FROM "Message" m
JOIN "WhatsAppSession" s ON s.id = m."sessionId"
WHERE m.direction = 'OUTBOUND'
  AND m."createdAt" > now() - interval '14 days'
GROUP BY 1, 2, 3
ORDER BY dia DESC, pct DESC;

-- 2. É o contato ou é o número?
--    Se as presas estão espalhadas por muitos contatos, o problema é do
--    número/conexão. Se estão concentradas em um contato só, provavelmente
--    aquele contato bloqueou — e aí "sem confirmação" está dizendo a verdade.
SELECT c.name,
       c."waJid",
       count(*) FILTER (WHERE m.status = 'SENT'
                        AND m."createdAt" < now() - interval '10 minutes') AS presas,
       count(*)                                                            AS total_enviadas,
       max(m."createdAt")                                                  AS ultima,
       count(*) FILTER (WHERE m.direction = 'INBOUND')                      AS respostas_recebidas
FROM "Message" m
JOIN "Conversation" conv ON conv.id = m."conversationId"
JOIN "Contact" c         ON c.id = conv."contactId"
WHERE m."createdAt" > now() - interval '30 days'
GROUP BY 1, 2
HAVING count(*) FILTER (WHERE m.status = 'SENT'
                        AND m."createdAt" < now() - interval '10 minutes') > 0
ORDER BY presas DESC
LIMIT 30;

-- 3. O número está caindo?
--    lastError preenchido e lastConnectedAt recente é sinal de reconexão.
--    Cada reconexão deixava um ciclo de polling órfão rodando (corrigido em
--    session-manager.ts) — e é durante a queda que os recibos se perdem.
SELECT id, "phoneNumber", status, "lastConnectedAt", "lastError", "updatedAt"
FROM "WhatsAppSession"
ORDER BY "updatedAt" DESC;

-- 4. Mensagens que saíram sem id nenhum gravado.
--    Deveria ser sempre zero. Qualquer linha aqui é uma mensagem que nenhum
--    recibo consegue encontrar, não importa o que o WhatsApp mande.
SELECT count(*) AS outbound_sem_id
FROM "Message"
WHERE direction = 'OUTBOUND'
  AND status <> 'PENDING'
  AND "waMessageId" IS NULL;

-- 5. Leitura devolvida ao contato (os dois tiques azuis que ELE vê).
--    readAt preenchido = a equipe leu no Dilon Zap. O aviso ao WhatsApp é
--    "melhor esforço": se o número estava desconectado naquele instante, o
--    contato nunca viu azul. Volume alto de leitura fora de horário de
--    conexão estável é indício do mesmo problema.
SELECT date_trunc('day', m."readAt")::date AS dia,
       count(*)                            AS inbound_lidas_no_sistema
FROM "Message" m
WHERE m.direction = 'INBOUND'
  AND m."readAt" > now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;
