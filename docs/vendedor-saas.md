# Vendedor IA do SDR (vendedor de SaaS)

Responde, no WhatsApp, as empresas que **responderam** a uma abordagem do SDR. Foi feito para a meta de abordar revendas
(25 por dia) e agendar demonstração do Dilon Zap, mas serve a qualquer campanha: o roteiro vem da campanha.

> Estado: **primeira versão** (v1.82.0). Testado com um provedor de IA falso (711 testes). Falta a primeira conversa real.

## O que ele faz e o que nunca faz

- **Nunca puxa assunto.** A primeira mensagem sai de uma pessoa, por clique, como sempre (`/abrir-conversa`). O vendedor só
  entra depois que a empresa escreveu, e só em conversa de empresa do SDR (contato com negociação de origem "SDR" ligada
  a um acompanhamento em andamento: contatada, respondeu, pediu informações ou demonstrou interesse).
- **Usa o roteiro da campanha:** argumento, ofertas, prova social, objeções com resposta e link da agenda.
- **Escolhe uma ação de uma lista fechada** (a IA não tem ferramentas e não executa nada):
  `continuar`, `interesse`, `demonstracao`, `transferir`, `sem_interesse`, `nao_contatar`.
  - `demonstracao`: manda o link da agenda (acrescentado pelo código se o modelo esquecer), sobe a etapa para *Reunião*,
    deixa "Confirmar a demonstração" como próxima ação e passa a conversa para Pendentes.
  - `transferir`: passa para Pendentes (preço fora do roteiro, contrato, problema técnico, mensagem confusa...).
  - `sem_interesse` / `nao_contatar`: registra no SDR e encerra. O pedido de não contatar usa **texto fixo** (nunca o do
    modelo) e entra na lista de bloqueio **antes** do envio.
- **Só cita endereços permitidos:** o link da agenda da campanha e o site da Dilon Tech. Qualquer outro endereço barra o
  envio e a conversa vai para uma pessoa.

## Regras de segurança (todas com teste)

| Regra | Comportamento |
|---|---|
| Só responde depois da empresa | Última mensagem da empresa, e a conversa começou por uma abordagem nossa. |
| Equipe fala, a IA sai | Mensagem de pessoa (Inbox ou celular) depois que a IA começou: passa a conversa e não responde. Se uma pessoa já tinha respondido a empresa antes de a IA chegar, a IA nem entra. |
| Horário | Segunda a sábado, 8h às 20h de Brasília (configurável). Fora dele espera e responde na próxima janela; passou de 48 h, não responde. |
| Limite de respostas | Depois de N respostas na conversa (padrão 8), passa para uma pessoa. |
| Falha da IA | Tenta de novo em 30 s e em 2 min; na terceira, passa para uma pessoa. Nada é enviado. |
| Orçamento | O da IA do SDR. Se acabar, a conversa vai para uma pessoa. |
| Só o necessário vai ao modelo | Nome, segmento, cidade, roteiro e histórico. Sem telefone, e-mail nem CNPJ. O texto da empresa vai como dado, nunca nas instruções. |
| Conversa longa | Mais de 40 mensagens sem a IA ter começado: não assume. |

## Dois modos

- **Sugerir** (padrão): a IA escreve; a tela mostra a resposta, e uma pessoa lê, edita e envia ("Enviar pelo WhatsApp") ou
  descarta. Nenhum efeito no SDR acontece antes do envio. É o modo para as primeiras conversas.
- **Automático**: a IA envia sozinha, dentro das regras. Ligue depois de ler algumas conversas e aprovar o que ela escreve.

## Onde mora

- **Código:** `packages/vendedor-ia/src/saas/` (`regras.ts`, `prompt.ts`, `vendedor.ts`). Fica **fora** do núcleo do SDR
  (`packages/sdr-core`), que continua sem tocar em conversa nem mensagem do WhatsApp (guardas em `test/comercial.test.ts` e
  `test/ia.test.ts`). O vendedor só usa a API pública do `sdr-core` (`executarTarefaIa`, `registrarResultado`, `registrarNota`).
- **Processo:** `apps/vendedor-ia-worker`, em laço próprio ao lado do Vendedor IA de carros. Uma falha de um não para o
  outro. Sem `ANTHROPIC_API_KEY`, só o de carros fica parado; o vendedor de SaaS segue pela configuração dele.
- **Saída:** grava mensagem `PENDING` (referência `vendedor-saas:`); o worker do WhatsApp envia em 1 a 5 s, como já faz com o
  Vendedor IA de carros.
- **Rotas:** `/api/vendedor-saas` (config e conversas), `/conversas/[id]/enviar` e `/descartar`. Ficam fora de `/api/sdr`,
  com o mesmo portão do SDR (recurso ligado na empresa e papel).
- **Tela:** SDR > aba **Vendedor IA**.
- **Banco** (só acréscimos): `SdrVendedorConfig`, `SdrVendedorConversa`, enums `ModoVendedorSaas` e `StatusVendedorSaas`.

## Modelo e custo: Claude ou Gemini

O provedor é escolhido na aba **IA** do SDR, na tarefa `vendedor_saas` (principal e reserva), como nas outras tarefas.
Na Dilon Tech foi configurado com o **plano gratuito do Gemini**: `gemini:gemini-3.5-flash-lite`, reserva
`gemini:gemini-3.1-flash-lite`, preço 0.

Medido em 15/11/2026 com a chave gratuita da Dilon Tech:

| Modelo | Resultado |
|---|---|
| `gemini-3.5-flash-lite` | 200, cerca de 1 s |
| `gemini-3.1-flash-lite` | 200, cerca de 2 s |
| `gemini-3.8-flash`, `3.7`, `3.6`, `3.5-flash`, `flash-latest` | sem resposta em 20 a 40 s no plano gratuito |
| `gemini-2.5-flash`, `2.5-flash-lite` | 404: "não está mais disponível para novos usuários" |

**Atenção ao plano gratuito:**
- O Google pode usar o conteúdo enviado nos serviços gratuitos para melhorar os produtos dele. Por isso só vai ao modelo o
  necessário (sem telefone, e-mail nem CNPJ), mas o texto que a empresa escreve vai junto. Se isso incomodar, troque o
  modelo da tarefa por um pago ou por Claude, sem mudar código.
- Há limite de requisições por minuto e por dia. Estourou, o vendedor tenta de novo e, na terceira falha, passa a conversa
  para uma pessoa.
- A leitura da foto da OS da Ótica usa `OTICA_LEITURA_MODELO` (na VPS: `gemini-3-flash-preview`, que funciona com a mesma
  chave). O padrão do código (`gemini-2.5-flash`) está obsoleto, mas só vale se a variável faltar.

## Como ligar (nesta ordem)

1. **IA do SDR** (aba IA): ligada, com orçamento e a tarefa `vendedor_saas` (já feito na Dilon Tech).
2. **Campanha** com o roteiro preenchido (argumento, ofertas, objeções e link da agenda). Sem roteiro o vendedor responde, mas
   transfere quase tudo.
3. **Aba Vendedor IA:** ligue em modo **Sugerir**, com o nome do assistente e as instruções extras.
4. **Processo:** subir o `vendedor-ia-worker` (`docker compose -f docker-compose.prod.yml up -d --no-deps vendedor-ia-worker`),
   com `GEMINI_API_KEY` no `.env`. Só o vendedor de SaaS roda enquanto `ANTHROPIC_API_KEY` estiver vazia.
5. **Teste com um número seu:** abra uma conversa pelo SDR para um número de teste, responda como se fosse a empresa
   ("quanto custa?", "já uso AutoCerto", "pode me ligar?", "não quero mais") e confira as sugestões.
6. Depois de ler 10 a 20 conversas, avalie o modo **Automático**.

## Limitações conhecidas

- Não agenda direto na agenda: manda o link e passa para uma pessoa confirmar.
- Não ouve áudio nem vê foto (vira `[áudio]` / `[foto]` no histórico); a IA pede para escrever.
- A etapa muda no SDR, mas não no funil do CRM (o espelho do CRM é feito pelas rotas do SDR, com a sessão de uma pessoa).
- Atende em conversas do número que recebeu a resposta, qualquer que seja; não separa por setor.
