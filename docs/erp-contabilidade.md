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
