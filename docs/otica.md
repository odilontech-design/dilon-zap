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

## Escanear OS do papel (v1.68.0)

Botão **Escanear OS do papel** no quadro (`/otica/os/escanear`). Serve para passar
para o sistema as OS do talão: as antigas, para guardar o histórico, e as novas
enquanto a loja ainda preenche à mão.

1. Escolher o tipo: **OS em andamento** (comporta-se como OS nova) ou **OS antiga**
   (só registro).
2. **Tirar foto** (câmera do celular) ou escolher da galeria. A foto é reduzida no
   aparelho antes de subir.
3. **Ler a OS**: a IA lê os campos escritos (cliente, receita, lentes, armação,
   medidas, laboratório, previsão, valor e sinal) e a tela abre o formulário
   da OS já preenchido, com o resumo do que não ficou claro.
4. A atendente **confere contra o papel** e salva. A leitura é só sugestão:
   grau fora do passo de 0,25, data impossível ou valor ilegível voltam como campo
   vazio com aviso, nunca como valor chutado.
5. Ao salvar, a **foto do talão fica guardada na OS** (R2). Na tela da OS há
   "Ver foto do talão" e "Trocar a foto".

**Número da OS.** Vem do papel (campo "Número da OS no papel", editável) e não
depende do contador. Se o número já existe, a OS não é criada ("Já existe a OS
0498"). Ao salvar com número do papel, a numeração automática nunca fica abaixo
dele.

**OS antiga (histórica).** Guarda a OS, a receita e a foto, sem Caixa, sem estoque
e sem WhatsApp: nenhuma conta a receber, nenhuma baixa de armação, nenhum aviso. Nasce
como Entregue, longe da coluna Entregue do quadro, não muda de etapa e o valor e o
sinal ficam só como registro. A tela da OS mostra "Registro histórico do talão de
papel".

**OS em andamento escaneada** segue todas as regras da OS nova: conta a receber, sinal
no Caixa (com a forma de pagamento), baixa da armação do estoque e avisos ao cliente.

**Configuração do servidor.** A leitura usa a API do Gemini, que tem camada gratuita.
- `GEMINI_API_KEY` no `.env` da VPS (o container `web` lê o `.env`). Gere a chave em
  aistudio.google.com. Sem a chave, a tela avisa que a leitura não está ligada e a OS
  segue sendo preenchida à mão.
- `OTICA_LEITURA_MODELO` (opcional): o modelo. Padrão `gemini-2.5-flash`. Se o Google
  aposentar o modelo, troque aqui sem nova versão.
- Limites da camada gratuita: poucas dezenas de pedidos por minuto e um teto diário. A
  rota espera 2,5 s entre uma foto e outra por empresa.
- **Privacidade (LGPD).** A foto da OS, com nome, CPF e receita do cliente, vai para a
  API do Google só na hora da leitura. Na camada gratuita o Google pode usar esse conteúdo
  para melhorar os produtos dele. Se a ótica não aceitar isso, use a camada paga (que não
  usa os dados) ou preencha à mão.
- O armazenamento de arquivos (R2) tem de estar configurado, como na foto do produto.

**Banco:** duas colunas novas em `OrdemServico`, ambas aditivas (`historica Boolean
DEFAULT false NOT NULL` e `fotoKey TEXT`). O ensaio somente leitura do `db push` deve
mostrar só isto:

```sql
ALTER TABLE "OrdemServico" ADD COLUMN "fotoKey" TEXT,
ADD COLUMN "historica" BOOLEAN NOT NULL DEFAULT false;
```

**Limpar OS de teste.** `docs/otica-limpar-os-de-teste.sql` remove as OS de teste e a
venda delas (conta, parcelas, pagamentos, movimentos de estoque) para a numeração voltar
ao número do talão. Roda com ROLLBACK por padrão.

Teste das regras de leitura: `npx tsx apps/web/lib/otica-leitura.test-manual.ts`.

## Ainda não faz (próximas fases)

- A OS não cria negociação no CRM nem Pedido (a OS já faz o papel de pedido).
- Lembrete de retirada, ajuste em 30 dias, pesquisa de satisfação e receita
  vencendo.
- Agenda de exames e emissão de nota fiscal.

Teste das regras: `npx tsx apps/web/lib/otica-regras.test-manual.ts`.
