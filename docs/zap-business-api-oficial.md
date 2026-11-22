# Dilon Zap Business: WhatsApp pela API oficial da Meta

> Estado: **proposta técnica do Tech Lead**, para aprovação do fundador. Nada daqui foi construído.
> Execução: o Gemini constrói os cartões marcados como `Gemini`; o Claude faz o que é marcado `Claude` (integração e segurança) e revisa tudo, conforme `docs/modelo-operacional-dev.md`.

## 1. O que é e o que não é

- **É** um segundo jeito de conectar um número ao Dilon Zap: pela **API oficial** (WhatsApp Business Platform, Cloud API da Meta), em vez do QR Code (Baileys).
- **Não substitui** o Baileys. Os dois convivem: **cada número (`WhatsAppSession`) tem um provedor**. Clientes atuais continuam como estão, sem nenhuma mudança.
- **Não é** um produto separado: é o mesmo Inbox, funil, setores e relatórios. Muda só como a mensagem entra e sai.
- Para quem serve: empresas com volume alto, que querem estabilidade e as regras oficiais da Meta, e quem precisa de mensagens ativas com modelo aprovado.
- **Não prometer** "sem risco de bloqueio". A Meta também limita contas por qualidade e pode restringir envios.

## 2. O que a Meta exige (o caminho crítico é este, não o código)

Fontes: [Tornar-se Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers), [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/), [Preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). **Conferir tudo nas páginas da Meta antes de decidir: regras e prazos mudam.**

- **Verificação do negócio** da Dilon Tech no Meta Business (CNPJ 64.601.665/0001-33).
- **Tech Provider:** depois da verificação, pedir acesso avançado às permissões de mensagens e de gestão de contas (revisão do app pela Meta). É o caminho mais simples para a Dilon conectar contas de clientes sem ser a faturadora do uso (Solution Partner é um processo bem mais longo).
- **Embedded Signup:** fluxo da Meta, dentro do Zap, em que o cliente conecta o próprio WhatsApp Business. Exige o app aprovado.
- O cliente precisa ter **forma de pagamento cadastrada** na conta dele: a Meta cobra o cliente direto (a Dilon não intermedia essa cobrança).
- **Preço:** cobrança **por mensagem**, desde 1º/jul/2025, por categoria de modelo (marketing, utilidade, autenticação) e país. Resposta dentro da janela de atendimento de 24 horas é livre de modelo; **fora dela só vale mensagem de modelo aprovado**. A cobrança em reais para contas brasileiras está em transição em 2026. **Obter a tabela em BRL na página de preços da Meta.**
- **Coexistência:** modo da Meta que permite manter o número também no aplicativo WhatsApp Business no celular. Pode ser decisivo para o cliente que não quer largar o celular. **Verificar disponibilidade e regras atuais.**

**Consequência para o prazo:** a Meta decide quando dá para operar em produção (dias a semanas). O desenvolvimento pode começar **hoje** com o **número de teste gratuito da Meta**, sem aprovação nenhuma. Por isso a Fase 0 abaixo é do fundador e começa já.

## 3. Estratégia de entrega em degraus

| Degrau | Como o cliente entra | Depende de |
| --- | --- | --- |
| A. Teste | Número de teste da Meta, só para a Dilon Tech | Nada (conta de desenvolvedor) |
| B. Primeiros clientes (assistido) | A Dilon e o cliente conectam a conta dele juntos, com credenciais geradas por ele | Verificação do negócio; definir com a Meta o caminho permitido |
| C. Autoatendimento | Embedded Signup dentro do Zap | App aprovado como Tech Provider |

Começar pelo A, atender os primeiros clientes pelo B e só então C.

## 4. Arquitetura

**Princípio 1: não tocar em `apps/worker/src/session-manager.ts`.** É o coração em produção do Baileys. A API oficial entra em módulos novos.

**Princípio 2: um provedor por número.** `WhatsAppSession` ganha `provedor` (padrão `BAILEYS`). Os números atuais não mudam.

```
                    ┌───────────────────────────── apps/web ─────────────────────────────┐
Meta (webhook) ───► │ /api/webhooks/whatsapp-cloud                                       │
                    │  1. valida X-Hub-Signature-256 (corpo bruto, HMAC, comparação segura)│
                    │  2. grava o evento bruto (idempotente) e responde 200 na hora       │
                    └───────────────┬────────────────────────────────────────────────────┘
                                    ▼ (tabela de eventos)
                    ┌──────────── apps/worker (módulo novo, separado do Baileys) ─────────┐
                    │ processa eventos: mensagem recebida, status (enviada/entregue/lida) │
                    │ envia: pega Message PENDING dos números CLOUD_API e chama a Meta   │
                    └─────────────────────────────────────────────────────────────────────┘
```

- **Entrada:** o webhook só valida e guarda. Quem processa é um módulo do worker, com repetição segura se falhar. Assim, nada se perde quando o sistema estiver reiniciando.
- **Quem é o cliente (tenant):** vem **do banco**, buscando `phone_number_id` na tabela de contas (único). **Nunca** de um campo livre do evento. Sem conta cadastrada, o evento é descartado e registrado.
- **Saída:** um poller novo, só para números `CLOUD_API`, que:
  - dentro da janela de 24 horas, envia texto livre;
  - fora da janela, **bloqueia o envio livre** e exige um modelo aprovado (erro claro na tela, usando as regras que já existem em `lib/janela-whatsapp-regras.ts`).
- **Status:** os retornos da Meta atualizam `MessageStatus` com a mesma semântica dos recibos de hoje.
- **Mídia:** baixar pelo id de mídia com o token do cliente e guardar no R2, nos mesmos campos de hoje (`mediaKey` etc.). Para enviar, subir a mídia para a Meta.
- **Gravação da mensagem recebida:** hoje a regra mora dentro de `recordMessage` (no session-manager, acoplada aos tipos do Baileys). **Claude extrai o núcleo em uma função independente de provedor** (contato, conversa, setor, menu de triagem, resposta automática), e o Baileys passa a usar a mesma. É a única parte de **risco alto** deste projeto (item 6).

## 5. Modelo de dados (só aditivo)

Esboço, a ser revisado antes de qualquer `db push`:

- `enum ProvedorWhatsApp { BAILEYS CLOUD_API }`; `WhatsAppSession.provedor ProvedorWhatsApp @default(BAILEYS)`.
- `WhatsAppCloudConta`: `tenantId`, `sessionId` (1:1), `wabaId`, `phoneNumberId` (**único no sistema**), token **criptografado** (chave só em variável de ambiente), situação, qualidade e limite informados pela Meta.
- `WhatsAppCloudEvento`: evento bruto, `idExterno` único (idempotência), estado de processamento, tentativas.
- `WhatsAppModelo`: nome, idioma, categoria, situação de aprovação, corpo, variáveis, por tenant.
- Recurso de plano `ZAP_BUSINESS` (sob demanda). Atenção: **valor novo de enum** é o ponto de maior risco para o cliente Prisma antigo. Ordem: publicar o código novo, **só depois** criar a linha do recurso para um cliente.

## 6. Cartões de tarefa

| # | Tarefa | Quem | Risco | Depende de |
| --- | --- | --- | --- | --- |
| **F0** | **Fase 0 (começa hoje):** criar o app em Meta for Developers; verificar o negócio da Dilon Tech; iniciar o registro como Tech Provider; criar o número de teste; cadastrar forma de pagamento; guardar app id, app secret e token **só no gerenciador de segredos** | Fundador | Baixo | |
| 1 | Schema aditivo (item 5) e `provedor` | Gemini escreve, Claude revisa e aplica | Médio | |
| 2 | Webhook de verificação e de recebimento, com assinatura, e gravação idempotente do evento | Gemini escreve, **Claude revisa** | **Alto** (segurança e tenant) | 1 |
| 3 | Criptografia do token em repouso | Claude | Alto | 1 |
| 4 | Extrair o núcleo de gravação de mensagem recebida (independente de provedor) | **Claude** | **Alto** | |
| 5 | Processador de eventos: mensagem recebida de texto e status | Gemini | Médio | 2, 4 |
| 6 | Poller de envio de texto dentro da janela de 24 horas | Gemini | Médio | 1, 3 |
| 7 | Tela de conexão do número oficial (modo assistido), com teste de ligação | Gemini | Baixo | 1, 3 |
| 8 | Modelos (templates): cadastro, envio para aprovação, sincronização do status, tela | Gemini | Médio | 6 |
| 9 | Envio fora da janela com modelo escolhido, e bloqueio do texto livre | Gemini + Claude | Médio | 8 |
| 10 | Mídia: receber e enviar | Gemini | Médio | 5, 6 |
| 11 | Paridade das automações (menu de triagem, resposta automática, setor, horário) usando o núcleo do item 4 | Claude | Alto | 4 |
| 12 | Painel de qualidade, limite de envio e uso por mensagem | Gemini | Baixo | 5 |
| 13 | Embedded Signup | Gemini + Claude | Alto | F0 (app aprovado) |
| 14 | Migração de um cliente do Baileys para a API oficial, com plano de reversão | Claude | Alto | tudo antes |

**Ordem sugerida:** 1 → 4 → 2 → 3 → 5 → 6 → 7 (**marco: conversa de texto ponta a ponta com o número de teste**) → 8 → 9 → 10 → 11 → 12 → 14 → 13.

## 6.1 Prazo realista

- **Marco "texto funcionando com o número de teste":** cerca de **2 a 3 semanas** de trabalho de Gemini e Claude, se as entregas forem pequenas e a revisão for rápida.
- **Uso em produção com cliente real:** depende da verificação da Meta (F0). Por isso F0 é a primeira tarefa de todas.

## 7. Segurança e isolamento entre empresas (conferir em toda revisão)

- Webhook **sem assinatura válida** é rejeitado, sempre. O segredo do app só no servidor.
- Tenant identificado **só** por `phoneNumberId` cadastrado, único no sistema.
- Evento repetido não duplica mensagem (idempotência por id externo).
- Token do cliente: criptografado, nunca em log, nunca enviado ao navegador.
- Nenhum conteúdo de mensagem em log.
- Registro de consentimento (opt-in) do contato antes de mensagens de modelo ativas.
- Sem acesso entre tenants fora de `/admin`.

## 8. Decisões que dependem do fundador

1. Quem arca com o custo por mensagem da Meta: **o cliente, direto na conta dele** (recomendado) ou a Dilon repassa?
2. **Preço do plano Business:** valor da licença do Zap + a implantação. (Não publicar antes do produto existir.)
3. Qual número será usado como teste e como primeiro cliente oficial.
4. Se haverá **coexistência** (número também no celular) para o primeiro cliente.
5. Quem fará o cadastro na Meta (F0), com acesso ao Meta Business da Dilon Tech.

## 9. Enquanto não existe

A página `/zap-business` do site deve ser **lista de espera e diagnóstico**, sem preço e sem prometer data.
