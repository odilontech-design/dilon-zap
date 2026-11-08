# Ótica (recurso OTICA)

Gestão de ótica dentro do Zap: ordens de serviço no formato do talão, receitas
dos clientes, laboratórios e o aviso ao cliente pelo WhatsApp quando o óculos
muda de etapa. A primeira cliente é a Visuallis.

## Como funciona

- **Quadro de OS** (`/otica`): uma coluna por etapa — Aberta, No laboratório,
  Montagem, Conferência, Pronta para retirada, Entregue. O botão do cartão leva
  à próxima etapa e avisa o cliente. Cartão com prazo vencido fica vermelho.
- **OS** (`/otica/os/nova` e `/otica/os/[id]`): os campos do talão de papel —
  cliente (CPF, RG, nascimento, endereço, que ficam na ficha do contato),
  receita (longe/perto, OD/OE, esférico, cilíndrico, eixo, DNP, altura e
  adição), lentes, tratamentos, armação, medidas (ponte, maior diagonal, A, B),
  laboratório, nº do pedido no laboratório, previsão, consultor, valor, sinal e
  saldo. Cliente que volta reaproveita a receita anterior.
- **Impressões** (`/imprimir/os/[id]?via=loja|montador|laboratorio`): a OS com
  a via do cliente, a ficha do montador e o pedido ao laboratório.
- **Avisos**: saem pelo número geral da loja, na fila de saída normal (respeitam
  bloqueio e caem na conversa do Inbox). Ligados por padrão: enviado ao
  laboratório, pronta e entregue. Cada mudança de etapa fica no histórico da OS
  com "cliente avisado" ou o motivo de não ter avisado.
- **Laboratórios e avisos** (`/otica/configuracoes`, só gestão): laboratórios
  com prazo (sugere a previsão), texto de cada aviso com prévia, próximo número
  de OS e validade da receita.

Os graus são guardados como inteiros (centésimos de dioptria, décimos de mm) —
ver `apps/web/lib/otica-regras.ts`. A previsão de entrega é lida e mostrada no
fuso da empresa (`Tenant.timezone`), não no do aparelho.

## Implantação

1. `npm run db:push` — cria as tabelas `OticaConfig`, `Laboratorio`,
   `ReceitaOtica`, `OrdemServico`, `EventoOS`, o enum `EtapaOS` e o valor
   `OTICA` no enum `Recurso`. Nada existente muda.
2. Redeploy do web. O worker não muda.
3. No Super Admin, ficha da empresa → plano → ligar **Ótica (ordens de serviço
   e receitas)**. É recurso sob demanda: não vem em plano nenhum.
4. Na empresa, em Ótica → Laboratórios e avisos: cadastrar os laboratórios,
   ajustar o **próximo número de OS** para continuar o talão de papel (a
   Visuallis estava na 0498) e revisar os textos dos avisos.

## Financeiro (v1.40.0)

A venda da OS é uma **conta a receber** do Zap — a mesma do Financeiro —, e não
um segundo caderno de dinheiro:

- Ao abrir a OS com valor, nasce a conta: o **sinal** é uma parcela de entrada já
  recebida (dinheiro, Pix ou cartão — informar a forma é obrigatório) e o **saldo**
  é uma parcela que vence na data de entrega. Sinal à vista cobrindo tudo = uma
  parcela só, quitada.
- **Receber** na tela da OS (saldo ou parte) cai no **Caixa do dia** por forma de
  pagamento e abate as parcelas da mais antiga para a mais nova. O que falta
  aparece em **Financeiro → A receber**, com o lembrete de vencimento que já existe.
- **Crediário próprio:** "Parcelar o saldo" (só a gestão) divide o que falta em
  parcelas semanais, quinzenais ou mensais. As telas de atraso e cobrança são as
  do Financeiro.
- **Corrigir o valor** da venda só quando há uma única parcela em aberto sem
  recebimento; já parcelada ou quitada, o ajuste é parcela por parcela no Financeiro.
- **Cancelar** a OS encerra o dinheiro na mesma transação: ou a loja **fica com o
  sinal** (como diz o talão: lente sob medida não tem cancelamento) e só o saldo
  deixa de ser cobrado, ou o sinal é **estornado** (sai do Caixa como estorno).
- O aviso "pronta para retirada" cita o saldo que vem da conta.
- A Ótica liga o **Financeiro** junto (Contas a receber), sem segunda exceção —
  salvo se alguém desligou Contas a receber de propósito.

**Banco:** só `OrdemServico.contaId` (coluna anônima, índice e chave estrangeira).
SQL esperado do `db push` desta versão:

```sql
ALTER TABLE "OrdemServico" ADD COLUMN "contaId" TEXT;
CREATE INDEX "OrdemServico_contaId_idx" ON "OrdemServico"("contaId");
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_contaId_fkey"
  FOREIGN KEY ("contaId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Não há índice único na coluna **de propósito**: o `db push` trata índice único novo
como risco de perda de dados e se recusa a rodar sem `--accept-data-loss`, que é
proibido neste projeto. Uma conta por OS é garantido no código (`criarContaDaOS`).
Siga o mesmo roteiro da implantação acima (backup, ensaio somente leitura, `db push`
sozinho, troca do site) — o ensaio tem de mostrar só esse SQL.

## Estoque de armações (v1.41.0)

Aba **Ótica → Armações**. Não usa o catálogo de Produtos de propósito: aquele é do
fluxo de Pedidos, e armação de ótica de bairro é, na maior parte, **peça única com
etiqueta** — então o cadastro é por **código da etiqueta**, a quantidade quase sempre
é 1 e vender a última peça a tira da escolha.

- **Importar da planilha** (só a gestão): cole as linhas copiadas do Excel. Aceita
  cabeçalho (Código, Modelo, Marca, Cor, Material, Medidas, Custo, Preço, Qtd, em
  qualquer ordem, com ou sem acento) ou a ordem padrão. A tela **confere antes**:
  mostra quantas são novas, quantas já existem e as linhas com problema (com o
  número da linha); linha ruim não impede as boas. Código que já existe é mantido,
  nunca sobrescrito — reimportar a mesma planilha não duplica estoque.
- **Cadastro e contagem:** cadastrar uma a uma, editar a quantidade na própria linha
  (vira um movimento de ajuste) e desativar.
- **Na OS**, a armação é escolhida pela etiqueta ou modelo (só aparecem as que ainda
  estão à venda) e o texto impresso já sai preenchido. Ao abrir a OS a peça **sai do
  estoque**; trocar a armação devolve a antiga e tira a nova; cancelar a OS devolve a
  peça. A saída é atômica: duas atendentes vendendo a mesma peça única ao mesmo tempo
  não conseguem as duas — a segunda recebe "já foi vendida" e a OS dela não é criada
  (nem o número, nem a conta a receber). Armação do cliente ou fora da lista continua
  sendo só texto.
- Cada entrada, saída, estorno e ajuste fica em `MovimentoArmacao`; a quantidade da
  armação é o cache desse saldo e só muda junto com um movimento.

**Banco:** duas tabelas novas (`Armacao`, `MovimentoArmacao`), o enum
`TipoMovimentoArmacao` e a coluna `OrdemServico.armacaoEstoqueId` com índice e chave
estrangeira. O único índice único é de tabela **nova** (`Armacao`), que o `db push`
aceita sem pedir confirmação. O ensaio somente leitura deve mostrar só isso:

```
CREATE TYPE "TipoMovimentoArmacao" ...
ALTER TABLE "OrdemServico" ADD COLUMN "armacaoEstoqueId" TEXT;
CREATE TABLE "Armacao" ...        CREATE TABLE "MovimentoArmacao" ...
CREATE INDEX / CREATE UNIQUE INDEX (tabelas novas) e OrdemServico_armacaoEstoqueId_idx
ALTER TABLE ... ADD CONSTRAINT (chaves estrangeiras das tabelas novas e de OrdemServico_armacaoEstoqueId_fkey)
```

## Ainda não faz (próximas fases)

- A OS não cria negociação no CRM nem Pedido (a OS já faz o papel de pedido).
- Lembrete de retirada, ajuste em 30 dias, pesquisa de satisfação e receita
  vencendo.
- Agenda de exames, importação das planilhas e emissão de nota fiscal.

Teste das regras: `npx tsx apps/web/lib/otica-regras.test-manual.ts`.
