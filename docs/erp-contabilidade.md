# ERP Dilon Contabilidade dentro do Zap

O ERP é um produto da empresa (tenant) no Super Admin: **/admin/tenants/[id] → "ERP Dilon Contabilidade"**.

## Como funciona
- **Ativar**: cria o escritório no ERP via API de plataforma (idempotente por `zapTenantId`), gera o administrador com **senha provisória exibida uma única vez** e soma o preço do ERP ao total da assinatura (`Subscription.amountCents`).
- **Plano, limites e preço**: Essencial 30 emp/3 usr (R$ 297), Profissional 100/8 (R$ 597), Escritório+ 250/20 (R$ 1.197), Sob medida. Os limites só travam *novos* cadastros no ERP.
- **Suspensão**: automática (assinatura cancelada/pausada, ou fatura em aberto vencida há mais de `ERP_TOLERANCIA_DIAS`, padrão 10) ou manual. A automática se desfaz sozinha quando regulariza; a manual só é desfeita por uma pessoa. Suspender bloqueia o acesso e derruba as sessões em até 30 s; nada é apagado.
- **Estado local só muda depois que o ERP confirma.** ERP fora do ar → a ação falha com mensagem e nada fica pela metade.
- Acesso dos escritórios: endereço único do ERP, `…/login?e=<código>`.

## Implantação
1. No ERP (Vercel): `PLATAFORMA_API_TOKEN` (≥ 32 caracteres aleatórios) e, opcional, `PLATAFORMA_URL_PUBLICA`. O push aplica a migração `20261010120000_plataforma`.
2. No Zap: `ERP_CONTABILIDADE_URL`, `ERP_CONTABILIDADE_TOKEN` (o mesmo valor), `CRON_SECRET`.
3. Zap: `prisma db push` (nova tabela `TenantErpContabilidade` e enums) e redeploy.
4. Cron na VM, a cada hora:
   `0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-ZAP/api/cron/erp-sync`

## Atenção de cobrança
Mudar o preço altera o total da assinatura, mas cobranças recorrentes já criadas no Mercado Pago/Asaas mantêm o valor antigo até gerar novo link de pagamento (o painel avisa).

## Painel gerencial e termo de aceite

- **/admin/erp** (menu "ERP Contabilidade"): todos os escritórios num só lugar — receita mensal do ERP, empresas e usuários em uso (com o limite do plano), última atividade, situação do termo e se o escritório está bloqueado. Abaixo, os escritórios que existem no ERP mas ainda não estão ligados a uma empresa do Zap.
- **Ligar um escritório que já existe** (ex.: Guttierres): na ficha da empresa, ative o ERP informando o *código do escritório* no campo "Escritório que já existe no ERP?". O Zap liga o escritório à empresa em vez de criar outro.
- **Exigir aceite do termo**: na ficha, bloco "Termo de aceite". As condições (plano, valor acordado e de tabela, garantia, primeira cobrança, fim do teste, dia de vencimento) vêm sugeridas a partir do plano e do dia de vencimento da assinatura e entram no texto que o sócio lê. O escritório vê uma faixa com a contagem regressiva; sem aceite até o prazo, **ou com recusa**, o acesso do escritório (equipe e portal dos clientes) é bloqueado — nada é apagado — e um novo aceite reabre na hora.
- **Comprovantes**: "Ver comprovantes" lista cada decisão (aceite/recusa) com data, nome, e-mail, CPF mascarado, IP e o código (hash) do texto aceito. O texto completo fica guardado no ERP e não pode ser alterado.
- **Aviso no painel**: o mesmo bloco publica um comunicado (informativo, alerta ou urgente) que aparece no topo do painel de todos os usuários do escritório, com data opcional para sumir.
- O texto do termo é uma **minuta** (`src/lib/termos.ts` no repositório do ERP) e deve ser revisada por advogado antes de uso. Dados da prestadora: variáveis `EMPRESA_RAZAO_SOCIAL`, `EMPRESA_CNPJ` e `EMPRESA_FORO` no ERP.

## Módulos por plano
- Na ficha da empresa, bloco **Módulos do plano**: marque os módulos que o escritório pode usar (Financeiro, Fiscal, Contabilidade, Pessoal, Documentos, Produtividade e Financeiro do escritório). Rotinas, tarefas, empresas-cliente e equipe são o núcleo e ficam sempre incluídos. Tirar um módulo o esconde do escritório na hora; os dados ficam guardados.
- **Padrão de cada plano** (`MODULOS_DO_PLANO` em `apps/web/lib/erp-regras.ts`, é decisão comercial e pode ser ajustada): Essencial = Financeiro, Documentos e Produtividade; Profissional = esses + Fin. do escritório, Fiscal e Pessoal; Escritório+ e Sob medida = todos. Um escritório **novo** nasce com os módulos do plano escolhido; um escritório **que já existia** (ligado pelo código) continua com todos. "Liberar tudo" tira a restrição.
- **Marca própria** é do próprio escritório: o sócio envia o logotipo e escolhe a cor em *Configurações*; o Super Admin não precisa fazer nada.

## Contratação online (página pública)
**Endereço:** `https://SEU-ZAP/contratar/contabilidade` (aceita `?plano=ESSENCIAL|PROFISSIONAL|ESCRITORIO_PLUS` para a página de vendas apontar direto para um plano). O plano Sob medida não se contrata online.

**Fluxo:** plano → dados do escritório (CNPJ, responsável, CPF, e-mail, WhatsApp) → leitura e aceite do termo → **e-mail de confirmação** → clique em "Confirmar e criar" → o sistema cria a empresa no Zap (assinatura **em teste**, valor do plano), o escritório e o sócio no ERP (com módulos e limites do plano e o aceite do termo registrado), tenta gerar a cobrança (Asaas) e manda o e-mail de boas-vindas com o acesso e a senha provisória. O teste dura 14 dias sem cobrança; a primeira cobrança vence no 15º dia (dia do mês de 1 a 28) e fica no termo.

**Segurança contra robô:** nada é criado antes de o e-mail ser confirmado; o link vale 24 h, só funciona uma vez e a criação acontece por clique (POST), então pré-visualização de e-mail não cria nada; campo-armadilha, teto de pedidos por endereço e por e-mail; CNPJ e CPF validados; o texto do termo é conferido por hash.

**Só funciona com:** `ERP_CONTABILIDADE_URL` + `ERP_CONTABILIDADE_TOKEN` (ERP) e `SDR_SMTP_HOST/PORT/USER/PASS/FROM` (a mesma caixa do SDR; sem ela a página mostra "indisponível"). `NEXTAUTH_URL` precisa ser o endereço público do Zap (vai no link do e-mail). Para a primeira cobrança automática: `ASAAS_API_KEY` e `ASAAS_ENV` (sem eles o escritório é criado mesmo assim e a cobrança fica pendente no painel). Rode `prisma db push` (tabela `ContratacaoErp`).

**No painel** (`/admin/erp`): lista "Contratações online" com a situação de cada pedido e o motivo de quem travou (ex.: cobrança não gerada). Um pedido que deu erro se resolve sozinho: a pessoa abre o mesmo link do e-mail de novo e a criação continua do ponto onde parou (sem duplicar empresa nem escritório; se o escritório já existia, é gerada uma nova senha provisória).

**Teste que acabou sem pagamento:** o ERP é suspenso depois de `ERP_TOLERANCIA_DIAS` (padrão 10) dias do fim do teste, se nenhuma fatura foi paga. Ao receber o primeiro pagamento, passe a assinatura para *Ativa* na ficha.

## Exportar os dados de um escritório
O termo promete devolver os dados a pedido (30 dias após o encerramento). Na ficha da empresa, bloco **Exportar os dados do escritório**: baixa o ZIP de **planilhas** (um CSV por tabela, abre no Excel) ou o de **documentos e entregas** (pastas por empresa). Funciona também com o escritório suspenso ou bloqueado pelo termo. Senhas e a senha gov.br não vão. Cada download fica na auditoria do Zap e na trilha do ERP. O próprio sócio também baixa em *Configurações* do ERP, mesmo bloqueado.

## Teste gratuito → assinatura ativa

Quando o primeiro pagamento é confirmado (webhook da Asaas: ativação do Pix Automático, `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` do cartão/boleto), a assinatura em `TRIAL` passa sozinha a `ACTIVE` (`converterTesteAoPagar` em `app/api/webhooks/asaas/route.ts`). É idempotente: evento repetido, ou assinatura que já não está em teste, não é alterada. Antes isso era manual no Super Admin.
