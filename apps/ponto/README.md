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

- **Cobrança.** O `/cadastro` libera o acesso, mas ainda não emite o boleto.
  Ligar ao `@dilon-zap/receivables` (Asaas ou Mercado Pago), com bloqueio
  automático se o boleto não for pago.
- **Recuperação de senha por email.** Hoje o administrador gera uma nova senha
  para o colaborador. O administrador que esquecer a própria senha precisa do
  suporte.
- **Termos de uso e política de privacidade** de verdade, revisados por
  advogado (a foto e a localização são dados pessoais).
- **AFD e AEJ** no layout da Portaria 671. O relatório "Marcações (registro
  original)" já traz NSR, data e hora, localização e código de integridade,
  mas não é o arquivo oficial.
- **Fechamento do mês com trava e assinatura do espelho:** são do plano Ponto.
