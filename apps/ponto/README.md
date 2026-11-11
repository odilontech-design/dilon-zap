# Dilon Ponto — app (plano Essencial)

Controle de ponto pelo celular e pelo computador. Esta primeira versão entrega
o **plano Essencial** (R$ 59,90/mês, de 1 a 10 colaboradores). Plano comercial,
especificação e roadmap: [`docs/ponto-rh/`](../../docs/ponto-rh/README.md).

## O que o Essencial entrega, e onde está

| Item do plano | Onde |
| --- | --- |
| Registro pelo app no celular ou pela web, com geolocalização | `/bater` (PWA instalável) e `app/api/marcacoes/route.ts` |
| Registro simples e simples com foto | Por colaborador (`modoRegistro`). A selfie vai para o R2 ou, sem R2, para o banco |
| Cálculo automático: horas trabalhadas, faltantes, atrasos, faltas, extra, banco de horas, adicional noturno | `packages/ponto-core` (motor com testes) e `lib/calculo.ts` (ponte com o banco) |
| Espelho de ponto | `/ponto` (administrador), `/meu-ponto` (colaborador), `/espelho/[id]` (impressão com assinaturas) |
| Ajustes manuais | Incluir, desconsiderar e abonar, sempre com motivo e autor (`lib/acoes-ponto.ts`). A marcação original nunca muda |
| Relatórios completos | `/relatorios`: resumo para a folha, ocorrências, marcações para conferir, ajustes e marcações originais. Todos em CSV |
| Até 2 turnos e 1 CNPJ | `lib/planos.ts`, conferido no servidor ao cadastrar |
| Até 10 colaboradores | Idem. O 11º é recusado com o convite para o plano Ponto |
| Liberação imediata após a contratação | `/cadastro` cria a empresa e o administrador e já entra |
| Pagamento via boleto bancário | Assinatura mensal por boleto no Asaas, criada na contratação (ver "Cobrança" abaixo) |
| Passo a passo para incluir os colaboradores | Checklist no `/painel` e, ao cadastrar cada colaborador, o texto pronto para enviar (copiar ou WhatsApp) com o CPF e a senha provisória |

## Garantias que não dependem do código das telas

- **Marcação imutável.** Um gatilho no Postgres recusa `UPDATE` e `DELETE` em
  `Marcacao` (migração inicial). Correção é tratamento.
- **NSR sequencial sem buracos** e **cadeia de hash** entre as marcações da
  empresa (`packages/ponto-db/src/marcacao.ts`). A tela de configurações
  mostra se a sequência está íntegra.
- **Nada impede a marcação.** Sem localização, sem foto ou feita sem internet,
  o registro entra e fica marcado para conferência.
- **Hora do servidor.** A hora do aparelho só vale para a marcação feita sem
  internet, enviada em até 72 horas.
- **Sessão relida do banco a cada requisição.** O colaborador desligado perde
  o acesso na hora, sem esperar o token expirar.

## Cobrança (boleto pelo Asaas)

Usa a **mesma conta Asaas** que cobra o Zap (`ASAAS_API_KEY`, `ASAAS_ENV`).

- **Na contratação:** cria o cliente (pelo CNPJ) e uma assinatura mensal por
  **boleto** de R$ 59,90. O primeiro vence em 3 dias
  (`PONTO_DIAS_PRIMEIRO_BOLETO`). O acesso já está liberado, e a página da
  cobrança no Asaas também aceita Pix.
- **Pagamentos:** chegam pelo webhook (`/api/webhooks/asaas`) e viram
  `Fatura` aqui. Na tela **Assinatura**, o botão "Já paguei: atualizar
  situação" consulta o Asaas direto, para quando o webhook atrasar.
- **Bloqueio:** a situação é calculada das faturas
  (`lib/cobranca-regras.ts`, com testes: `npm test -w apps/ponto`).
  - Até o vencimento, só um aviso.
  - Depois dele, mais 5 dias de prazo (`PONTO_TOLERANCIA_DIAS`) com contagem
    regressiva.
  - Passado o prazo, **só o painel do administrador** bloqueia (abre direto a
    tela Assinatura). Os colaboradores continuam batendo ponto, porque um
    buraco no registro de jornada prejudicaria o trabalhador e a empresa numa
    fiscalização.
  - Pagou, desbloqueia sozinho.
- **Se o Asaas falhar** na contratação, a conta é criada mesmo assim. O erro
  fica guardado e a tela Assinatura mostra o botão "Gerar boleto". Essa
  situação não bloqueia, porque a falha é nossa.
- **Empresa de demonstração ou cortesia:** `formaCobranca = ISENTA` (o seed
  já cria assim).

Para ligar em produção:

1. No `.env` do servidor: `ASAAS_API_KEY` (já existe, é a do Zap),
   `ASAAS_ENV="production"` e `PONTO_ASAAS_WEBHOOK_TOKEN` (valor aleatório:
   `openssl rand -base64 32`).
2. No Asaas, em **Integrações > Webhooks**, crie um **segundo** webhook (o
   primeiro é o do Zap) para `https://<domínio do ponto>/api/webhooks/asaas`,
   com o mesmo token e os eventos de cobrança (`PAYMENT_*`).
3. Confira no Asaas se as notificações por email ao cliente estão ligadas:
   é por elas que o boleto chega no email do administrador.

Como os dois produtos usam a mesma conta, cada webhook recebe também os
pagamentos do outro. O do Ponto ignora o que não é dele (200, "não é do
Ponto"). O do Zap registra no log um "pagamento sem subscription
correspondente" para cada boleto do Ponto. Esse aviso não tem efeito, mas
polui o log, e dá para filtrar lá pelo `externalReference` com prefixo
`ponto:`.

## Rodando

Da raiz do monorepo, com o Postgres do `docker compose` no ar:

```bash
# no .env: PONTO_DATABASE_URL, PONTO_DIRECT_URL e PONTO_NEXTAUTH_SECRET (ver .env.example)
npm install
npm run ponto:generate
npm run ponto:deploy     # aplica as migrações (inclui o gatilho de imutabilidade)
npm run ponto:seed       # padaria de demonstração com duas semanas de marcações
npm run dev:ponto        # http://localhost:3002
```

Logins da demonstração:

- **Administrador:** `admin@paodeouro.com.br` / `ponto123`
- **Colaboradores:** o CPF que o seed imprime / `ponto123`

Use **`ponto:deploy`** (migração), não `db push`: o `db push` não cria o gatilho
que torna a marcação imutável.

## O que ainda falta para vender

- **Testar a cobrança no sandbox do Asaas** com uma chave real antes do
  primeiro cliente. Os testes automáticos usaram um servidor falso que imita
  a API.
- **Troca de plano e cancelamento pela tela.** Hoje são feitos pela Dilon:
  no Asaas e no banco (`plano`, `canceladaEm`).
- **Recuperação de senha por email.** Hoje o administrador gera uma nova senha
  para o colaborador. O administrador que esquecer a própria senha precisa do
  suporte.
- **Termos de uso e política de privacidade** de verdade, revisados por
  advogado (a foto e a localização são dados pessoais).
- **AFD e AEJ** no layout da Portaria 671. O relatório "Marcações (registro
  original)" já traz NSR, data e hora, localização e código de integridade,
  mas não é o arquivo oficial.
- **Fechamento do mês com trava e assinatura do espelho:** são do plano Ponto.
