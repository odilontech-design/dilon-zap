# Vendedor IA (recurso VENDEDOR_IA)

Atendente com IA no WhatsApp da revenda. Responde o primeiro contato a qualquer
hora, consulta o estoque de verdade, manda a ficha e as fotos do carro e passa
para um vendedor quando o cliente quer negociar, financiar, dar carro na troca
ou visitar a loja. É a resposta ao "Vendedor Certo" da AutoCerto (R$ 1.200/mês
por até 1.000 leads, preço de novembro de 2026).

> Estado: **primeira versão** (v1.46.0). O encanamento foi testado com um
> cliente falso da API. **Falta a primeira conversa contra a API de verdade**,
> que precisa da chave (ver "Antes de ligar para um cliente").

## Como funciona

- **Processo próprio:** `apps/vendedor-ia-worker`, como o `sdr-worker`. Ele não
  importa nada do worker do WhatsApp e não abre porta. Se a API ficar lenta, a
  chave vencer ou o processo cair, o WhatsApp de todos os clientes segue normal:
  só a IA para de responder, e a equipe atende pelo Inbox.
- **Ciclo:** a cada 3 s, para cada loja com o recurso liberado e a IA ligada,
  olha as conversas do número geral com mensagem do cliente nos últimos 15 min.
  As regras de quando responder estão em `packages/vendedor-ia/src/regras.ts`,
  com teste:
  - **Espera** 6 s de silêncio, para responder de uma vez quem manda a mensagem
    em pedaços.
  - **Não assume** conversa já atribuída a alguém, conversa em que a equipe já
    falava, nem mensagem anterior ao momento em que a IA foi ligada.
  - **Sai da conversa** assim que uma pessoa da equipe responde, pelo Inbox ou
    pelo celular.
  - **Transfere** depois de 20 respostas na mesma conversa.
  - **Não responde** mensagem com mais de 15 min, por exemplo depois de o
    processo ficar fora do ar.
- **Ferramentas** (`prompt.ts`), em modo estrito:
  - `buscar_estoque`: só carros disponíveis ou reservados, e só o que pode ir
    ao cliente. Nunca custo, piso, placa ou observação interna.
  - `enviar_carro`: a mesma ficha do botão do Inbox, com as fotos e o link da
    vitrine.
  - `transferir_para_vendedor`: põe a conversa em Pendentes, no setor escolhido,
    com um resumo para o vendedor.
- **Saída:** a resposta é gravada como mensagem pendente na conversa. O worker
  do WhatsApp envia, e a conversa aparece normal no Inbox. As mensagens da IA
  levam `referenciaExterna = "vendedor-ia:…"` e não têm remetente.
- **Automações do número:** ligar a IA desliga a saudação, o menu e a ausência
  do número geral (`semAutomacoes`), para não responderem os dois. Desligar a
  IA devolve como estava.
- **Áudio e foto do cliente:** a IA não ouve nem vê. Pede para o cliente
  escrever e transfere se ele insistir.

## Chamada à API

- **Modelo:** padrão Claude Opus 5.5, configurável por loja (Opus 5.5, Sonnet 5.5
  ou Haiku 5.5). Esforço padrão `low`, que é o recomendado para conversa.
- **Recusa:** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) nos
  modelos que aceitam. Se a resposta for recusada mesmo assim, a conversa vai
  para um vendedor.
- **Cache automático** (`cache_control` no topo): instruções e ferramentas não
  mudam entre chamadas. A data e a hora da loja entram no fim, numa mensagem de
  sistema, para não quebrar o cache.
- **Custo:** cada chamada grava tokens e custo em `VendedorIaUso`, com o preço
  do modelo que de fato respondeu. É daqui que sai o custo real por lead no
  painel.

## Custo por lead

Conta em `packages/vendedor-ia/src/custo.ts`, com teste. Preços da Anthropic
(US$ por milhão de tokens):

| Modelo | Entrada | Saída | Cache (leitura) | Cache (escrita, 5 min) |
|---|---|---|---|---|
| Claude Opus 5.5 | 4,00 | 20,00 | 0,20 | 5,00 |
| Claude Sonnet 5.5 | 2,00 | 10,00 | 0,10 | 2,50 |
| Claude Haiku 5.5 | 0,10 | 0,50 | 0,01 (aprox.) | 0,125 |

Premissas de um lead típico (`PREMISSAS_PADRAO`):
- 6 respostas da IA, com consulta ao estoque em 60% delas;
- prompt fixo de 2.500 tokens, histórico médio de 700 e resultado de busca de 900;
- 350 tokens de saída por resposta;
- metade das respostas encontra o cache ainda válido.

| Modelo | US$ por lead | R$ por lead (câmbio 5,50) | 300 leads/mês | 1.000 leads/mês |
|---|---|---|---|---|
| Claude Opus 5.5 | 0,130 | 0,72 | R$ 215 | R$ 716 |
| Claude Sonnet 5.5 | 0,065 | 0,36 | R$ 107 | R$ 358 |
| Claude Haiku 5.5 | 0,003 | 0,02 | R$ 6 | R$ 18 |

**É estimativa.** O número que vale é o custo médio por lead que o painel mostra
com conversas reais. A primeira semana de uso define a precificação.

### Precificação sugerida (a validar com o custo medido)

- No Opus 5.5, 1.000 leads custam cerca de R$ 716. Cobrar R$ 497 sem limite de
  leads dá prejuízo em loja grande.
- **Vendedor IA até 300 leads/mês: R$ 497.** Custo estimado no Opus de R$ 215,
  margem de cerca de 57%.
- **Até 1.000 leads/mês: R$ 997**, ainda abaixo dos R$ 1.200 da AutoCerto.
  Custo estimado no Opus de R$ 716 (margem de cerca de 28%), ou de R$ 358 no
  Sonnet 5.5 (cerca de 64%).
- O limite de leads e o teto de custo por loja ficam na configuração. Passou do
  limite, a IA não assume conversa nova no mês.
- A escolha do modelo é decisão de produto. Antes de trocar o Opus por um mais
  barato, compare a qualidade das respostas em conversas reais da Sales.

## Configuração (Veículos → Vendedor IA, só a gestão)

- Liga e desliga.
- Nome do assistente.
- "O que a IA precisa saber da loja": endereço, horário, pagamento, garantia.
- Setor que recebe as transferências.
- Modelo, com o custo estimado de cada um.
- Esforço.
- Limite de leads e teto de custo do mês.
- Painel do mês: leads, transferências e motivos, custo real, custo médio por
  lead e as últimas conversas com o resumo deixado ao vendedor.

## Implantação

1. `npm run db:push`. Cria `VendedorIaConfig`, `VendedorIaConversa`,
   `VendedorIaUso`, o enum `StatusConversaIa` e o valor `VENDEDOR_IA` em
   `Recurso`. Nada existente muda.
2. Colocar `ANTHROPIC_API_KEY` no `.env` da VPS.
3. `docker compose -f docker-compose.prod.yml up -d --build web vendedor-ia-worker`.
   O worker do WhatsApp não muda.
4. No Super Admin, na ficha da empresa, ligar **Vendedor IA** (recurso sob
   demanda).
5. Na empresa: Veículos → Vendedor IA, preencher as informações da loja e ligar.

Local: `npm run dev:vendedor-ia` (lê o `.env` da raiz). Testes:
`npm run test:vendedor-ia`.

## Antes de ligar para um cliente

1. Com a chave configurada, fazer um teste com um número de teste e um estoque
   pequeno:
   - "ainda tem o X?";
   - um carro que não existe;
   - pedido de desconto;
   - financiamento;
   - troca;
   - áudio;
   - uma pessoa da equipe respondendo no meio.
2. Conferir no painel o custo por lead e ajustar as premissas e o preço.
3. Ler 10 a 20 conversas reais da primeira semana e ajustar as instruções.

## Ainda não faz

- Atender só fora do horário comercial (hoje atende sempre que ligada).
- Selo "IA atendendo" e botão "assumir" no Inbox. Hoje, responder na conversa já
  tira a IA dela.
- Transcrever áudio do cliente.
- Agendar visita direto na agenda. Hoje coleta o dia e transfere.
- Avisar o cliente quando entrar um carro que ele procurou e não havia.
