# Revenda de veículos (proposta de recurso VEICULOS)

Análise do mercado de sistemas para revendas de carros e o projeto de um módulo
vertical do Zap para vender a lojas de seminovos. Segue o mesmo molde da Ótica
(`docs/otica.md`): recurso sob demanda, que reaproveita contato, Inbox, funil,
financeiro e caixa que já existem, e acrescenta só o que é do ramo.

> Estado: **proposta**. Nada aqui está implementado.
> Data da pesquisa: 11/11/2026. Os dados de concorrentes são o que os próprios
> fornecedores divulgam. Não foram testados e os preços podem ter mudado.

---

## 1. Resumo e recomendação

**Vale fazer, mas não como "mais um ERP de revenda".** O mercado já tem mais de
dez sistemas entre R$ 150 e R$ 720 por mês, todos com a mesma lista: estoque,
FIPE, NF-e, RENAVE, integração com portais, site, financeiro e CRM. Quem chegar
com a mesma lista disputa só no preço.

O que o Dilon Zap tem e eles não têm é o **WhatsApp como sistema de verdade**.
Ele é o centro do Inbox multiatendente, do funil, dos avisos automáticos, da
fila anti-bloqueio e do SDR. Nos concorrentes, o WhatsApp aparece como um botão
"chamar no WhatsApp" ou uma integração presa. E é no WhatsApp que a revenda
vende: o lead do portal pede "ainda tem?", o vendedor manda fotos e vídeo, negocia
a troca e a parcela.

**Posicionamento sugerido:** *"o sistema da revenda que vende pelo WhatsApp"*.
Cada lead de portal cai no Inbox já com o carro anexado, nenhum lead fica sem
resposta, e estoque, documentação e financeiro ficam no mesmo lugar.

**Regra de ouro do projeto:** construir o que diferencia (atendimento, funil,
estoque com custo e margem, vitrine, follow-up) e **integrar** o que é
regulatório ou comoditizado (NF-e, RENAVE, consultas veiculares, assinatura,
portais), com parceiros homologados. Homologar RENAVE ou um emissor fiscal
próprio custa meses e não vende um carro a mais.

---

## 2. Momento do mercado: RENAVE obrigatório

Este é o gatilho comercial de 2026 e precisa estar no discurso:

- A **Resolução CONTRAN nº 1.026/2026** tornou o RENAVE (Registro Nacional de
  Veículos em Estoque) obrigatório para usados e seminovos em todo o país. Toda
  entrada e saída de estoque, inclusive consignado, precisa ser registrada.
- O prazo de adequação terminou por volta de **28/09/2026**. As fontes divergem
  em um ou dois dias, então confira no DOU. A Senatran publicou um calendário de
  implantação para outubro e novembro de 2026 (Circular nº 2/2026).
- Efeito prático citado por várias fontes: **carro fora do RENAVE não
  financia**, e a maior parte das vendas de seminovos passa por financiamento.

Consequência: as lojas pequenas que ainda trabalham com planilha estão sendo
**obrigadas** a contratar algum sistema agora. É uma janela de aquisição, e quem
não tiver RENAVE no dia 1 fica fora da conversa. Por isso o RENAVE entra na
fase 1 via integradora parceira (seção 7).

---

## 3. Concorrentes analisados

### Click Garage (clickgarage.com.br)

Segundo o site do fornecedor:

| Área | O que oferece |
|---|---|
| Estoque | Cadastro de veículos com documentos, notas, contratos, despesas e receitas **por veículo** |
| Fiscal | Emissor de NF-e próprio para revenda (entrada e saída), **apto para consignados** |
| Regulatório | Diz ser **integradora oficial do RENAVE homologada pela Senatran**, "sem custo adicional". Tem landing própria (renave.clickgarage.com.br) e sites satélite (renavesp.com.br, sistemalojadeveiculos.com.br) |
| Mercado | Integração com FIPE (custo × valor de mercado) e com portais de anúncio |
| Site | Site da loja com domínio próprio |
| Gestão | Caixa, DRE gerencial, perfis de acesso, **multi-CNPJ (filiais)** |
| Planos | Faixas por **quantidade de veículos** (até 50, 100, 150), **lojas e usuários ilimitados**. Valor de referência de R$ 299,90, 20% de desconto no anual, 15 dias grátis, sem multa de cancelamento |

**Leitura:** produto maduro e focado em back-office, fiscal e regulatório. A
força dele é o RENAVE próprio e o SEO, com vários domínios para capturar a
busca "RENAVE". O ponto fraco aparente é o atendimento: não há menção a Inbox,
CRM de verdade ou automação de WhatsApp.

### RPM Systems (rpmsystems.com.br)

O site não abriu nesta sessão, porque a rede bloqueia o domínio. O resumo abaixo
vem do índice de busca e **precisa ser conferido**. Uma segunda busca não achou
outras fontes sobre o produto, o que sugere uma empresa nova ou pequena.

| Área | O que diz oferecer |
|---|---|
| Estoque | Fotos, **precificação automática pela FIPE**, histórico de custos, **margem em tempo real**, **alerta de carro parado há mais de 30 dias** |
| Consignação | Proprietário, valor acordado, comissão e prazo |
| Fiscal / regulatório | NF-e e RENAVE |
| Operação | **Vistoria digital com laudo em PDF**, contratos de compra e venda com **assinatura eletrônica**, consultas veiculares |
| Integrações | OLX, Mercado Livre, Webmotors, **WhatsApp Business oficial** |
| Outros | CRM, várias filiais, **assistente de IA**, app (rpmsystems.com.br/app), 100% nuvem, teste de 7 dias sem cartão |

**Leitura:** é o concorrente mais parecido com a nossa tese, porque tem CRM,
WhatsApp e IA. Ainda assim, o WhatsApp parece ser uma integração e não o centro
do produto. Vale criar uma conta de teste dos dois e cronometrar o caminho
"lead do portal → resposta → visita → venda".

### Outros do mercado (preços divulgados pelos próprios fornecedores)

| Sistema | Preço divulgado | Observação |
|---|---|---|
| AutoCerto | a partir de R$ 150/mês (100 veículos) | Site grátis, RENAVE, avaliação; diz publicar em mais de 20 portais; vende "com IA" |
| Simples Veículo | R$ 169,90 a R$ 1.497/mês | Do plano só com nota fiscal até o Enterprise |
| GoRevenda | R$ 197 / 347 / 597 | 14 dias grátis |
| Velix | R$ 349 / 549 / 719 | Mobiauto, Chaves na Mão, AutoLine além dos grandes |
| System4R | a partir de R$ 449,90 | Revendas e locadoras |
| Spice Digital (integrador) | R$ 499/mês | Só integração de portais, ilimitada |
| Revenda Mais, Boom Sistemas, Gestor Revenda, StockCarWeb | não divulgado | Estoque, NF-e, integrador, CRM |
| AutoSDR | a partir de R$ 297/mês | Só CRM/WhatsApp com IA para revendas, sem ERP |

**Faixa de preço do mercado:** de R$ 150 a R$ 350 na entrada e de R$ 500 a
R$ 720 no topo. O preço costuma ser por número de veículos em estoque, e não
por usuário.

---

## 4. O que é um sistema completo de revenda: mapa de funcionalidades

Legenda: ✅ o Zap já tem, 🟡 tem a base e precisa adaptar, ❌ não tem.

| # | Funcionalidade | Zap hoje | Como resolver |
|---|---|---|---|
| 1 | Atendimento WhatsApp multiatendente, setores, transferência, alerta sem resposta | ✅ | Inbox, Setores, alerta de conversa sem resposta |
| 2 | CRM / funil de vendas com tarefas, notas, anexos e motivo de perda | ✅ | `Negociacao`, `Funil`, `TarefaNegociacao`, `MotivoDePerda` |
| 3 | Respostas rápidas, automações, horário, URA | ✅ | `SavedText`, `AutoReply`, `BusinessHour`, `UraOpcao` |
| 4 | Contas a receber/pagar, caixa, fornecedores, plano de contas | ✅ | Financeiro, `Caixa`, `Fornecedor`, `CategoriaFinanceira` |
| 5 | Prospecção ativa (repasse, lojistas, frotistas) | ✅ | Dilon SDR |
| 6 | **Estoque de veículos** (placa, chassi, Renavam, versão, ano/modelo, km, cor, combustível, opcionais) | ❌ | Novo: `Veiculo` |
| 7 | **Custo por veículo** (compra, despachante, funilaria, mecânica, polimento, IPVA) e **margem real** | 🟡 | Novo: `CustoVeiculo`, ligado a `ContaPagar` |
| 8 | Fotos e vídeos do carro, envio pelo Inbox | 🟡 | R2 já existe (`packages/storage`); novo `FotoVeiculo` |
| 9 | Tabela FIPE (preço sugerido, comparação, histórico) | ❌ | API da FIPE (integração) |
| 10 | Avaliação de carro na troca (checklist, fotos, proposta) | ❌ | Novo: `AvaliacaoVeiculo` |
| 11 | Consignação (dono, valor líquido, comissão, prazo, prestação de contas) | ❌ | Novo: `Consignacao`, repasse gerando `ContaPagar` |
| 12 | Venda do veículo: entrada, troca, financiamento, comissão do vendedor | 🟡 | Novo `VendaVeiculo` gerando `ContaReceber`, como a OS da ótica |
| 13 | Contratos (compra, venda, consignação, procuração) com assinatura eletrônica | ❌ | Modelo próprio, assinatura via parceiro |
| 14 | Recibos e impressões | 🟡 | Já existem `/recibo` e `/imprimir` |
| 15 | **NF-e de entrada e saída** (inclusive consignado e emissão para pessoa física) | ❌ | Parceiro emissor (API) |
| 16 | **RENAVE** (entrada, saída, transferência, ATPV-e) | ❌ | Integradora homologada (API) |
| 17 | Consultas veiculares (débitos, multas, gravame, leilão, roubo/furto, recall) | ❌ | Parceiro de consulta (pago por consulta) |
| 18 | Integração com portais (Webmotors, OLX, Mercado Livre, iCarros, Mobiauto, Facebook) | ❌ | Integrador de anúncios ou API direta (seção 7) |
| 19 | Site/vitrine da loja com domínio próprio | ❌ | Página pública no Next.js, com o botão levando ao WhatsApp |
| 20 | Simulação de financiamento e envio de ficha a bancos | ❌ | Fase 3, via correspondente bancário parceiro |
| 21 | Pós-venda: garantia, revisão, aniversário de compra, recompra | 🟡 | `ScheduledMessage` e automações existentes |
| 22 | Relatórios: giro, dias em estoque, margem por carro e vendedor, DRE | 🟡 | `reports` e `crm-relatorios` existem; faltam os do ramo |
| 23 | Multi-loja / multi-CNPJ | 🟡 | Hoje 1 tenant = 1 empresa; filiais via `Setor` ou CNPJ por loja |
| 24 | App celular (fotos no pátio, avaliação na rua) | 🟡 | O Zap já é PWA (`manifest.ts`, push); falta fluxo de câmera |

**Conclusão:** cerca de **metade de um sistema de revenda já existe no Zap**, e
é justamente a parte que os concorrentes fazem pior (itens 1 a 5). Falta o
núcleo de estoque (6 a 12) e as integrações regulatórias (15 a 18).

---

## 5. Diferenciais para vender (o que nenhum deles faz bem)

1. **Lead de portal vira conversa.** O lead do Webmotors/OLX chega por e-mail ou
   webhook, o Zap cria contato, conversa e negociação **com o carro anexado**, e
   o vendedor da vez recebe push. Meta: primeira resposta em menos de 5 minutos,
   medida no painel.
2. **"Ainda tem?" respondido sozinho.** A IA lê o estoque e responde
   disponibilidade, preço, km e fotos do carro certo, e passa para um humano ao
   detectar intenção (troca, financiamento, visita). Fora do horário, agenda a
   visita.
3. **Ficha do carro em um toque no Inbox.** O vendedor busca "HB20 2021" e manda
   fotos, vídeo, ficha técnica e simulação de parcela sem sair da conversa.
4. **Interesse sem estoque.** "Procuro Corolla até 100 mil": quando entra um
   carro compatível, o Zap avisa automaticamente todos os interessados. Revendas
   perdem muita venda por não ter isso.
5. **Carro parado custa dinheiro.** Alerta aos 30, 45 e 60 dias com o custo
   diário (capital parado), sugestão de reprecificação pela FIPE e disparo
   segmentado para a base com o preço novo, dentro da fila anti-bloqueio.
6. **Pós-venda que gera recompra e indicação.** Mensagens de 7 dias, 6 meses
   (revisão) e 1 ano, além do lembrete de transferência ou licenciamento.
7. **Consignante no WhatsApp.** O dono do carro consignado recebe atualização
   ("3 interessados esta semana", "proposta de R$ X") e prestação de contas na
   venda. Isso traz mais carros consignados, ou seja, estoque sem capital.
8. **Prospecção com o Dilon SDR** para comprar carro: frotistas, locadoras e
   repasse entre lojistas.

---

## 6. Projeto técnico dentro do Zap

### 6.1 Encaixe

- Novo valor `VEICULOS` no enum `Recurso`, **sob demanda** como `OTICA`
  (`RECURSOS_SOB_DEMANDA` em `apps/web/lib/plano-regras.ts`), e ligando
  `CONTAS_RECEBER` automaticamente como a ótica faz.
- Rotas em `apps/web/app/(dashboard)/veiculos` e `apps/web/app/api/veiculos`.
- Vitrine pública em uma rota fora do dashboard (por exemplo
  `apps/web/app/loja/[slug]`), com domínio próprio servido pelo Caddy, que já
  emite certificado automático.
- O worker de WhatsApp não muda na fase 1.

### 6.2 Modelo de dados (rascunho)

Valores em centavos e km em inteiro, seguindo o padrão do schema.

```prisma
enum StatusVeiculo { AVALIACAO PREPARACAO DISPONIVEL RESERVADO VENDIDO DEVOLVIDO }
enum OrigemVeiculo { COMPRA TROCA CONSIGNACAO REPASSE }

model Veiculo {
  id            String  @id @default(cuid())
  tenantId      String
  placa         String?
  chassi        String?
  renavam       String?
  marca         String
  modelo        String
  versao        String?
  anoFabricacao Int
  anoModelo     Int
  km            Int
  cor           String?
  combustivel   String?
  cambio        String?
  opcionais     String[]
  codigoFipe    String?
  fipeCents     Int?          // último valor consultado
  fipeEm        DateTime?
  precoCents    Int           // preço de anúncio
  precoMinCents Int?          // piso de negociação (só gestão vê)
  status        StatusVeiculo @default(PREPARACAO)
  origem        OrigemVeiculo
  entradaEm     DateTime      // base dos "dias em estoque"
  saidaEm       DateTime?
  descricao     String?       // texto do anúncio
  publicado     Boolean       @default(false) // vitrine e portais
  // relações: fotos, custos, consignacao, venda, negociacoes, interessados,
  // documentos (CRLV, laudo, procuração), eventos (histórico)
  @@unique([tenantId, placa])
}

model CustoVeiculo     { veiculoId, tipo (COMPRA|DESPACHANTE|MECANICA|FUNILARIA|ESTETICA|IPVA|OUTRO), valorCents, contaPagarId? }
model FotoVeiculo      { veiculoId, key (R2), ordem, capa }
model Consignacao      { veiculoId, proprietarioContactId, valorLiquidoCents, comissaoCents|percentual, prazoAte, contaPagarId? }
model AvaliacaoVeiculo { contactId, negociacaoId?, dados do carro, checklist Json, fotos, propostaCents, virouVeiculoId? }
model VendaVeiculo     { veiculoId @unique, contactId, vendedorId, precoCents, entradaCents,
                         trocaVeiculoId?, financiadoCents?, banco?, comissaoCents, contaReceberId,
                         nfeChave?, renaveProtocolo? }
model InteresseVeiculo { contactId, filtros Json (marca, modelo, faixa de ano e preço), avisadoEm? }
```

Ligações com o que já existe:

- `Negociacao` recebe `veiculoId?`: o funil continua sendo o mesmo e o card mostra
  foto e preço do carro.
- A venda gera `ContaReceber` (entrada, troca como abatimento, saldo financiado
  como parcela a receber do banco), igual à OS da ótica. Os custos geram
  `ContaPagar`, então o DRE e o Caixa já saem certos.
- A margem por carro é preço de venda menos a soma de `CustoVeiculo` menos a comissão.

### 6.3 Telas da fase 1

1. **Estoque**: grade com foto, dias em estoque (cor por faixa), preço × FIPE,
   margem prevista e filtros. Mostra "carro parado" em destaque.
2. **Ficha do carro**: dados, fotos (upload em lote pelo celular), custos,
   documentos, negociações e interessados, histórico.
3. **Entrada do carro**: assistente de compra, troca ou consignação, que já cria
   a conta a pagar.
4. **Venda**: assistente de entrada, troca e financiamento, que gera conta a
   receber, contrato e recibo, e marca o carro como vendido.
5. **No Inbox**: botão "Enviar carro" (fotos, ficha e link da vitrine) e carro
   vinculado à negociação.
6. **Vitrine pública** por loja, com o botão de WhatsApp que abre a conversa com
   a mensagem "Tenho interesse no {carro} ({link})", para o Zap identificar o carro.

---

## 7. Integrações: construir ou contratar

| Integração | Recomendação | Notas |
|---|---|---|
| **FIPE** | Integrar já na fase 1 | Há APIs públicas da tabela FIPE (não oficiais) e serviços pagos com SLA. Guarde o código FIPE e faça cache mensal, porque a tabela muda uma vez por mês |
| **RENAVE** | **Integradora homologada** via API (fase 1 ou 2) | Homologar-se como integradora é processo longo junto à Senatran. Negocie a revenda do serviço: custo por operação repassado com margem, ou incluído no plano |
| **NF-e** | Emissor via API (Focus NFe, PlugNotas, NFe.io e similares) | Revenda tem regras próprias (CFOP de veículo usado, entrada de pessoa física, consignação, Convênio ICMS para usados). **Validar as regras com um contador**. A Dilon Contabilidade é uma ponte natural |
| **Consultas veiculares** | Parceiro, cobrado por consulta | Débitos, gravame, leilão, roubo e furto. Revender com margem |
| **Portais** | Fase 2: começar por **um integrador de anúncios**; APIs diretas depois, para os portais que mais trazem lead | Cada portal tem API, credenciamento e formato próprio. O que mais importa é **capturar o lead** (webhook ou leitura do e-mail do portal) e jogá-lo no Inbox |
| **Assinatura eletrônica** | Parceiro com API (Clicksign, ZapSign, Autentique etc.) | Enviar o link de assinatura pelo próprio WhatsApp |
| **Financiamento** | Fase 3, via correspondente parceiro | Começar com simulação simples (taxa × prazo) gerada no Inbox |
| **IA ("ainda tem?")** | Fase 2 | Reaproveitar o padrão de uso de IA do SDR (`SdrIaConfig`, `SdrIaUso`, cache) para controlar custo por empresa |

---

## 8. Roteiro

| Fase | Prazo indicativo | Entrega | Objetivo comercial |
|---|---|---|---|
| **0. Validação** | 2 semanas | Entrevistar 5 a 10 revendas, testar Click Garage e RPM, fechar 1 ou 2 lojas piloto (como a Visuallis na ótica) | Confirmar dor e preço antes de codar |
| **1. MVP** | 6 a 8 semanas | Estoque, custos e margem, fotos, FIPE, entrada, venda, consignação, financeiro integrado, "Enviar carro" no Inbox, vitrine, contratos em PDF, alerta de carro parado | Piloto rodando a operação |
| **1b. Regulatório** | em paralelo | RENAVE e NF-e via parceiros | **Sem isso não dá para vender fora do piloto** |
| **2. Diferenciais** | +6 semanas | Captura de leads de portais no Inbox, publicação via integrador, IA "ainda tem?", interesse sem estoque, pós-venda automático, assinatura eletrônica, relatórios (giro, margem, vendedor) | Argumento de venda contra os concorrentes |
| **3. Escala** | depois | Avaliação no celular (PWA com câmera), multi-loja/CNPJ, simulação e ficha de financiamento, app do consignante, API oficial do WhatsApp como opção | Lojas médias e redes |

---

## 9. Preço e empacotamento (hipótese a validar)

O mercado cobra por **faixa de estoque**, então siga o mesmo padrão para facilitar
a comparação. Mantenha usuários ilimitados ou generosos, já que o Click Garage
usa isso como argumento.

| Plano | Estoque | Inclui | Preço sugerido |
|---|---|---|---|
| **Garagem** | até 30 carros | Estoque, financeiro, Inbox (1 número), vitrine, FIPE | R$ 249/mês |
| **Revenda** | até 80 carros | + portais, captura de leads, IA, pós-venda, contratos | R$ 449/mês |
| **Revenda+** | até 200 carros | + multi-loja, relatórios avançados, SDR | R$ 749/mês |

Cobrados à parte, por uso e com margem: emissão de NF-e acima de uma franquia,
operações RENAVE (ou franquia inclusa, já que o Click Garage diz incluir sem
custo), consultas veiculares, assinaturas e números de WhatsApp extras
(`MULTI_NUMERO`).

Para entrar no mercado: implantação gratuita com migração da planilha ou do
sistema anterior, de 14 a 15 dias grátis e sem fidelidade, que é o padrão do
mercado. O argumento de troca é *"traga seu estoque e seu WhatsApp, estamos
rodando em 1 dia"*.

---

## 10. Riscos e cuidados

1. **WhatsApp não oficial (Baileys).** O Zap usa conexão não oficial. Revendas
   fazem disparo para a base com frequência, e um bloqueio derruba o canal de
   vendas da loja. Mitigação: manter a fila e o limite anti-bloqueio,
   desencorajar disparo em massa sem consentimento e **planejar a API oficial
   (Cloud API) como opção** no plano superior. A RPM já anuncia "WhatsApp
   Business oficial" e vai usar isso contra nós.
2. **Dependência regulatória.** Sem RENAVE e NF-e funcionando, a loja não pode
   operar. Escolha parceiros com SLA, guarde o protocolo de cada operação e trate
   a falha do parceiro com fila e nova tentativa visível na tela, como o ERP já faz.
3. **Responsabilidade fiscal.** Regra de CFOP e ICMS de usados errada gera multa
   para o cliente. É preciso validação contábil e termo de responsabilidade, e o
   modelo de termo de aceite do ERP pode ser reaproveitado.
4. **LGPD.** Os contratos têm CPF, CNH e endereço, e as consultas veiculares
   trazem dados de terceiros. Defina retenção, perfis de acesso e registro em
   `AuditLog`.
5. **Escopo.** "Sistema completo" é uma lista sem fim. Segure a fase 1 no que o
   piloto usa todo dia.

---

## 11. Próximos passos

1. Liberar `clickgarage.com.br` e `rpmsystems.com.br` na rede da sessão, ou
   criar contas de teste, para uma comparação tela a tela. A análise acima veio
   do índice de busca.
2. Escolher 1 ou 2 revendas piloto da rede de contatos.
3. Pedir proposta a duas integradoras de RENAVE e a dois emissores de NF-e (preço
   por operação, SLA e suporte a consignação).
4. Aprovar o modelo de dados da seção 6.2 e abrir a fase 1.

## Fontes

- [Click Garage](https://clickgarage.com.br/) · [Planos](https://clickgarage.com.br/planos) · [RENAVE Click Garage](https://renave.clickgarage.com.br/) · [Renave SP](https://renavesp.com.br/) · [Sistema Loja de Veículos](https://sistemalojadeveiculos.com.br/)
- [RPM Systems](https://rpmsystems.com.br/) · [App RPM](https://rpmsystems.com.br/app)
- [RENAVE obrigatório 2026 (Rede Cred Auto)](https://blog.redecredauto.com.br/renave-obrigatorio-veja-o-que-muda-em-2026/) · [O que é RENAVE (Revenda Mais)](https://revendamais.com.br/blog/o-que-e-renave-registro-nacional-de-veiculos-em-estoque/) · [AG TV](https://www.agtv.com.br/post/72715/34historico-contran-torna-o-renave-obrigatorio-em-todo-o-brasil-e-inicia-uma-nova-era-para-o-mercado-automotivo34) · [Simples Veículo, RENAVE](https://simplesveiculo.com.br/renave-obrigatorio/)
- [AutoCerto](https://autocerto.com/) · [Simples Veículo](https://simplesveiculo.com.br/) · [GoRevenda](https://gorevenda.com.br/) · [Velix](https://www.velix.autos/) · [System4R](http://www.system4r.com.br/2.0/) · [Spice Digital](https://spicedigital.com.br/integrador) · [Gestor Revenda](https://www.gestorrevenda.com.br/) · [StockCarWeb](https://stockcarweb.com.br/) · [Boom Sistemas](https://lp.boomsistemas.com.br) · [AutoSDR](https://blog.autosdr.com.br/blog/melhor-crm-concessionaria-motos-caminhoes-2025)
