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

## Ainda não faz (próximas fases)

- OS não gera Pedido nem lança no Caixa/A receber: valor, sinal e saldo ficam
  na própria OS.
- Lembrete de retirada, ajuste em 30 dias, pesquisa de satisfação e receita
  vencendo.
- Agenda de exames, importação das planilhas e emissão de nota fiscal.

Teste das regras: `npx tsx apps/web/lib/otica-regras.test-manual.ts`.
