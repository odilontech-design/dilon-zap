# Revenda de veículos (proposta de recurso VEICULOS)

Análise do mercado de sistemas para revendas de carros e o projeto de um módulo
vertical do Zap para vender a lojas de seminovos. Segue o mesmo molde da Ótica
(`docs/otica.md`): recurso sob demanda, que reaproveita contato, Inbox, funil,
financeiro e caixa que já existem, e acrescenta só o que é do ramo.

> Estado: **fase 1 em andamento** (v1.45.0). O que já existe está na seção
> "Implementado"; o resto do documento continua sendo proposta.
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

## Implementado (v1.43.0): núcleo da fase 1

Menu **Veículos** (`/veiculos`), visível só para empresa com o recurso
`VEICULOS` ligado.

- **Estoque**: cartões com capa, preço × FIPE, dias em estoque com cor (30
  dias amarelo, 60 laranja, 90 vermelho) e, para a gestão, custo e margem. Os
  chips do topo mostram os filtros, quantos carros estão parados há 60+ dias
  e o capital empatado no estoque. A aba **Vendidos** soma a margem bruta.
- **Entrada** (`/veiculos/novo`, só gestão), de dois tipos:
  - **Compra:** o valor pago vira o custo "Compra do veículo" e, se marcado,
    uma conta a pagar ao vendedor, já quitada quando foi pago na hora.
  - **Consignação:** o dono (um contato) e o valor líquido que ele recebe.
  Placa repetida no pátio é recusada. O carro entra **em preparação** ou já
  **disponível**.
- **FIPE**: na entrada e na ficha, "Preencher pela tabela FIPE" (marca, modelo
  e ano) traz o código, o valor e a referência. Usa a API pública da Parallelum
  (`lib/fipe.ts`), com cache de 12 h. Se ela não responder, tudo se digita à mão.
- **Ficha** (`/veiculos/[id]`): fotos, custos, margem, venda, dados e histórico.
  - **Fotos:** várias por envio, 10 MB cada, até 40 por carro. A primeira é a
    capa, e qualquer foto pode virar capa.
  - **Custos** (só a gestão): oficina, despachante, estética etc., com conta a
    pagar opcional. Tirar um custo cancela a conta lançada junto, desde que
    ela não tenha pagamento.
  - **O que o vendedor não vê:** custo, margem, piso de negociação, valor do
    consignado e observações internas. A rota nem manda esses dados.
- **Enviar pelo WhatsApp**: a ficha vai como legenda da capa, sem custo e só com
  o final da placa, e as outras fotos seguem (até 10). Sai pelo número geral da
  loja, na fila normal de saída, e a conversa aparece no Inbox. A rota também
  aceita `conversationId`, para o botão no Inbox (fase seguinte).
- **Reserva**: o cliente fica com o carro até uma data, com sinal ou sem. O
  sinal cai no **Caixa** e abre a conta a receber da venda. Ao cancelar, a loja
  escolhe entre devolver o sinal (estorno) e ficar com ele.
- **Venda** (direta ou concluindo a reserva):
  - **A conta a receber** vale preço − troca, e se divide em:
    - **sinal** (já recebido na reserva);
    - **entrada** (recebida agora, cai no Caixa);
    - **financiamento** (uma parcela, na data em que o banco paga a loja);
    - **crediário da loja** (o restante, em parcelas).
  - **A troca** entra no estoque em preparação, com o valor dela como custo de
    compra e sem conta a pagar, porque foi paga com abatimento.
  - **Consignado:** a venda lança a conta a pagar do **repasse ao dono**.
  - **Comissão do vendedor:** fica registrada e entra na margem da venda.

Código: `lib/veiculos.ts` (banco e dinheiro), `lib/veiculos-regras.ts`
(regras puras), `lib/veiculos-schemas.ts`, `app/api/veiculos/**` e
`app/(dashboard)/veiculos/**`.

Testes: `npx tsx apps/web/lib/veiculos-regras.test-manual.ts` (regras) e
`npx tsx apps/web/lib/plano-regras.test-manual.ts` (o recurso traz o
Financeiro junto). Os fluxos de dinheiro foram conferidos contra um Postgres
local: compra paga, reserva com sinal, venda com troca, financiamento e
crediário, consignado, cancelamento com e sem devolução e envio pelo WhatsApp.

### Implantação

1. `npm run db:push`. Cria `Veiculo`, `CustoVeiculo`, `FotoVeiculo`,
   `VendaVeiculo`, `EventoVeiculo`, os enums e o valor `VEICULOS` em `Recurso`.
   Nada existente muda.
2. Redeploy do web. O worker não muda.
3. Opcional: `FIPE_TOKEN` no `.env`, se o limite gratuito da FIPE apertar
   (cadastro grátis em fipe.parallelum.com.br).
4. No Super Admin, ficha da empresa → plano → ligar **Revenda de veículos**.
   O recurso é sob demanda, como a Ótica, e liga Contas a receber junto.

## Implementado (v1.44.0): botão no Inbox e vitrine pública

- **Inbox → "Carro"** (empresas com `VEICULOS`): busca no estoque e manda a
  ficha com as fotos (0 a 10) na conversa aberta. O modal fica aberto para
  mandar mais opções. "Ficha no campo" põe o texto no campo de digitação
  para o vendedor ajustar antes de mandar.
- **Vitrine pública** em `/loja/[slug]` (o slug da empresa), sem login:
  - **Listagem:** busca, marca, preço máximo e ordenação.
  - **Página do carro:** galeria, ficha, opcionais e o botão **"Tenho
    interesse"**. O botão abre o WhatsApp da loja com o nome do carro e o link
    dele na mensagem, para o vendedor saber no Inbox de qual carro se trata.
    No celular, o botão fica fixo no rodapé.
  - **Prévia do link:** a capa aparece quando o link é compartilhado no
    WhatsApp ou no Instagram.
- **Configuração** em Veículos → **Vitrine** (só a gestão):
  - liga e desliga a vitrine (nasce **desligada**);
  - define nome, endereço e "sobre" da loja;
  - define o WhatsApp do botão (vazio = o número conectado);
  - escolhe se os carros reservados aparecem, com selo.

  Cada carro tem **"Mostrar na vitrine"** na ficha.
- **Link no envio:** com a vitrine ligada, a ficha enviada pelo WhatsApp (pela
  ficha do carro ou pelo Inbox) leva o link do carro na vitrine.
- **Segurança:** a vitrine seleciona só a lista do que pode ser público
  (`SELECT_PUBLICO` em `lib/vitrine.ts`). Nunca saem custo, piso, placa,
  chassi, Renavam, observações internas nem dados do consignante. A foto
  pública (`/api/loja/[slug]/fotos/[id]`) só responde enquanto o carro está
  na vitrine. Testado: carro escondido e vitrine desligada respondem 404.

Implantação: `npm run db:push` (cria `VeiculosConfig` e a coluna
`Veiculo.naVitrine`) e redeploy do web. O link público usa `NEXTAUTH_URL`
como endereço do site, então ele precisa ser o domínio de produção.

## Implementado (v1.45.0): importação do estoque por planilha

Veículos → **Importar planilha** (só a gestão). Serve para trazer o estoque
de uma loja que vem de outro sistema (AutoCerto, planilha) sem cadastrar carro
por carro.

- **Formato:** CSV, com separador e codificação detectados (inclusive o
  Latin-1 do Excel antigo). Para Excel, salvar como CSV. Há modelo para baixar.
- **Colunas:** reconhecidas pelo nome, sem acento nem caixa ("Valor de
  venda", "Preço", "preco"). Obrigatórias: marca, modelo, ano ("2022/2023" ou
  ano fab./modelo), km e preço. Opcionais: versão, placa, cor, câmbio,
  combustível, portas, custo, FIPE, opcionais, descrição, chassi, Renavam,
  data de entrada, tipo e **fotos** (links). Coluna desconhecida é listada e
  ignorada.
- **Dois tempos:** "Conferir" mostra o que entra, as linhas com problema (com
  o número da linha) e o que já está no estoque; "Importar" grava. Linha ruim
  não impede as boas.
- **Sem duplicar:** placa que já está no pátio fica de fora; sem placa, vale
  marca + modelo + ano + km. Reimportar a mesma planilha não duplica nada.
- **Como o carro entra:** disponível, como compra. O custo da planilha vira o
  custo de compra **sem conta a pagar**, porque é estoque já pago.
- **Fotos:** baixadas depois, em lotes, com barra de progresso. Fechar a
  página pausa, e dá para continuar depois. Foto que falha vai para o
  histórico do carro e não trava as outras.
- **Segurança do download** (`lib/baixar-imagem.ts`): só http(s), nada de rede
  interna, localhost ou metadados da nuvem. Cada redirecionamento é conferido,
  só JPG/PNG/WEBP e até 10 MB.

Testes: `npx tsx apps/web/lib/veiculos-importacao.test-manual.ts` (leitura da
planilha). A gravação, a reimportação, o download e os bloqueios de rede
interna foram conferidos contra um Postgres local.

Implantação: `npm run db:push` (coluna `Veiculo.fotosParaImportar`) e redeploy.

## Implementado (v1.54.0): importação do estoque a partir do site atual

Veículos → **Importar** → "Trazer o estoque do site atual". A loja digita o
endereço do site que usa hoje; o Zap lê os carros e cria as fichas. Primeiro o
caso real: a Sales Automóveis (site no AutoCerto, 60 carros).

**Como funciona:**
- **Layout lido:** o do AutoCerto, que muitas revendas usam: uma lista com todos
  os carros e uma página por carro (`/Veiculo/<nome>/<id>/detalhes`). Outros
  sites: a tela diz que não reconhece e manda usar a planilha.
- **O que vem:** marca, modelo, versão, ano, cor, câmbio, combustível, opcionais
  e todas as fotos (a primeira é a capa). "IPVA pago", "chave reserva" e afins
  são situação do carro, não opcional, e ficam de fora.
- **Duas etapas:** "Conferir" mostra o que entra, sem gravar; "Importar" cria as
  fichas e abre a página de cada carro (5 por vez). Na Sales, 60 carros e 1.142
  fotos entraram em cerca de 40 segundos. As fotos entram na mesma fila de
  download da planilha, com barra de progresso.
- **Reimportar não duplica:** o id do carro no site (`siteOrigemId`) fica
  guardado, também para carro vendido aqui e ainda no site antigo. Esse id
  servirá para redirecionar os endereços antigos no Google.
- **Limite do plano:** o que passa das vagas do pátio fica de fora, como na planilha.
- **Página de um carro que não abriu:** o carro entra só com a capa, com aviso,
  e uma nova importação completa os que faltam.

**O que o site não publica, e a trava que isso exige.** No site da Sales, 59 dos
60 carros estão como "Sob Consulta", 56 têm "N/I" na quilometragem e nenhum tem
placa. Por isso os carros entram **em preparação**, fora da vitrine e dos
portais. A ficha avisa o que falta, e "Pronto para vender" só libera com preço
e quilometragem informados (`409` com o motivo). A placa não trava, mas a OLX a
exige para publicar. A quilometragem fica marcada como "não informada"
(`kmInformado`) para um carro nunca aparecer com 0 km por engano.

**A quilometragem é opcional, por loja (v1.55.1).** Veículos → Vitrine → "Exigir a
quilometragem para colocar o carro à venda" (ligado por padrão). Lojas como a
Sales, que nunca preencheram a km (o AutoCerto grava 0), desligam: o carro vai à
venda sem ela, e a km aparece como **"não informada"**, nunca como "0 km", em todo
lugar: vitrine e dados estruturados do Google, feeds (CSV da Meta em branco, XML sem
a tag, JSON nulo), ficha enviada por WhatsApp, lista do Estoque, seletor do Inbox e
Vendedor IA (que passa a dizer que vai confirmar a km com a equipe). Um carro zero km
de verdade (km informada como 0) continua mostrando "0 km". Alguns portais exigem a km
para publicar; para eles, o carro sem km fica de fora do anúncio.

**Segurança:** o endereço é digitado por quem usa, então a busca recusa
localhost, rede interna, metadados da nuvem (169.254.x), esquemas que não sejam
http(s) e endereço com usuário e senha, e confere de novo cada
redirecionamento. Tamanho da página limitado a 3 MB.

**Testes** (de `apps/web`, com `DATABASE_URL` de um Postgres local):
- `npx tsx lib/importar-site.test-manual.ts`: leitor, com trechos reais do site
  da Sales em `test-fixtures/` e, se existir, a página inteira.
- `npx tsx lib/importar-site-estoque.test-manual.ts`: motor com um site falso,
  Postgres, reimportação, plano e erros.

## Implementado (v1.56.0): completar o estoque com a planilha do AutoCerto

Veículos → **Importar** → "Completar com a planilha do AutoCerto". Segundo passo da
migração da Sales: depois de trazer os carros do site (fotos e opcionais), a
planilha de estoque que o AutoCerto exporta (Estoque e Integrador → Estoque →
exportar) traz o que o site esconde.

**O que a planilha tem e o site não:** placa (60 de 60 na da Sales), o preço dos
classificados (o "Preço" do site é 0, daí o "Sob Consulta"), o valor FIPE, a
data de cadastro e o ano de fabricação (o site mostra só o do modelo).

**O que ela também não tem:** a **quilometragem**. O AutoCerto grava 0 e a loja
nunca a preencheu lá (na da Sales, 3 de 60 têm). Ela precisa ser informada carro
por carro; os carros continuam em preparação até lá.

**Como casa:** pela marca, modelo, versão, **ano do modelo** e cor, só quando o
par é único dos dois lados (na Sales, 60 de 60 casaram 1 a 1). Repetido ou sem par
fica de fora e aparece na conferência.

**O que preenche:** só campo vazio (preço 0, sem placa, sem FIPE, km não informada).
Nada que alguém tenha digitado é sobrescrito, então repetir a operação não muda
nada. Nos carros vindos do site, também acerta o ano de fabricação e a data de
entrada (que passam a contar os dias reais em estoque). Placa que já está em
outro carro do estoque não é aplicada.

**Arquivo:** o AutoCerto exporta uma tabela HTML com extensão `.xls`, em Latin-1 e
sem `<tr>`. O leitor aceita o arquivo como ele vem, inclusive com os acentos lidos
errado no cabeçalho.

**Teste** (de `apps/web`): `DATABASE_URL=… npx tsx lib/importar-autocerto.test-manual.ts`
(dados inventados; com `AUTOCERTO_XLS=<arquivo>` confere também a planilha real).

## Implementado (v1.57.0): espelho do site atual

Enquanto o AutoCerto (ou outro site antigo) for o cadastro principal do estoque, e
é ele que publica nos portais, o Zap o **acompanha**, para a vitrine nova não
mostrar carro que já foi vendido lá. O Zap guarda de onde importou
(`VeiculosConfig.siteOrigemUrl`) e relê o site de hora em hora.

- **Carro novo no site:** entra no Zap em preparação, com fotos e opcionais (o mesmo
  caminho da importação). O preço e a placa dele vêm da planilha do AutoCerto,
  que a gestão envia em "Completar com a planilha do AutoCerto".
- **Carro que saiu do site:** é **escondido da vitrine do Zap na hora** e marcado
  (`sumiuDoSiteEm`): aparece como "saiu do site antigo" no Estoque, na ficha e na
  lista do cartão "Acompanhando o site atual". **Nunca é vendido nem apagado sozinho**:
  uma venda tem comprador, valor e dinheiro. A gestão decide: registra a venda pela
  ficha, ou clica em "Continua à venda: reativar" (volta à vitrine e o carro deixa de
  ser comparado com o site, `seguirSite=false`; o id do site fica, para o importador
  não duplicá-lo se ele reaparecer).
- **Carro que voltou ao site:** volta para a vitrine sozinho.
- **Não mexe em:** carro vendido no Zap e carro cadastrado à mão (sem id de site).
- **Trava de segurança:** site fora do ar, em manutenção ou com o layout mudado pode
  parecer vazio. Site que não responde ou sem carros dá **erro**, nunca "tudo vendido".
  E se **mais de 30% dos carros rastreados (e pelo menos 5)** sumirem de uma vez,
  nada é escondido e o resumo avisa "ATENÇÃO: confira se o site mudou".
- **Falha visível:** o agendamento que não consegue ler o site grava "Falhou em
  <data>: <motivo>" no cartão, em vez de a gestão achar que está tudo em dia.

**Agendamento (VPS):** `POST /api/cron/sincronizar-sites` com `Authorization: Bearer
$CRON_SECRET`, como o `erp-sync`:

```text
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-ZAP/api/cron/sincronizar-sites
```

Uma loja com problema não atrapalha as outras. "Sincronizar agora" faz o mesmo pela tela
(Veículos → Importar → "Acompanhando o site atual").

**Limite:** o preço dos carros novos não está no site. Até a loja enviar a planilha, eles
ficam em preparação. A saída definitiva é o Zap virar o cadastro principal e publicar
nos portais (os conectores ainda não existem; ver `docs/portais-e-site.md`).

**Teste** (de `apps/web`): `DATABASE_URL=… npx tsx lib/espelho-do-site.test-manual.ts`
(21 verificações com um site falso: saiu, voltou, reativado sem duplicar, novo, vendido e
manual intocados, site fora do ar e vazio, trava de 8 de 10 sumirem).

## Baixa em lote dos carros que saíram do site (v1.112.0)

Em **Veículos > Importar > "Acompanhando o site atual"**, os carros que saíram do site antigo esperam a confirmação da gestão. Antes era um a um, pela ficha. Agora dá para marcar vários e:

- **Baixar como vendidos:** o carro sai do pátio, da vitrine e (pelo worker) dos portais. A data de saída é a em que ele sumiu do site. **Não cria a venda** (comprador, valor, pagamento): isso continua pela ficha ou pela planilha de controle de vendas. Fica registrado no histórico do carro como "baixado em lote".
- **Foi engano:** os carros voltam à vitrine e deixam de ser comparados com o site antigo (o mesmo que a ficha faz, em lote).
- **Ficam de fora da baixa** (a tela explica o motivo): carro **reservado** (tem sinal e cliente a resolver) e **consignado** (a venda pela ficha é que gera o repasse ao dono).
- Pede confirmação na própria tela, vale no máximo 100 carros por vez, só para a gestão, sempre na loja da sessão, e é registrado na auditoria (`veiculos.baixa-em-lote`, `veiculos.reativar-em-lote`).
- API: `POST /api/veiculos/sincronizar-site/lote` com `{ acao: "baixar" | "reativar", ids }`.

## Implementado (v1.48.0): planos da revenda

Tabela em `apps/web/lib/veiculos-planos.ts`, com teste. O Super Admin define o
plano na ficha da empresa, no bloco "Revenda de veículos".

| | Garagem | Revenda | Revenda+ |
|---|---|---|---|
| Preço | R$ 397 | R$ 597 | R$ 897 |
| Carros no estoque (preparação, disponível e reservado) | 30 | 70 | 150 |
| Catálogo do Facebook e Instagram | não | sim | sim |
| Mais de um número de WhatsApp | não | não | sim |
| Usuários | ilimitados | ilimitados | ilimitados |

- **Limite de carros:**
  - **Entrada:** barra o carro novo quando o estoque está cheio, com a mensagem
    do plano.
  - **Importação:** entram as primeiras linhas que cabem, e as outras aparecem
    como "ficam de fora pelo limite do plano".
  - **Troca na venda:** nunca é barrada, porque barrar seria barrar a venda.
    O estoque pode ficar acima do limite até sair um carro.
- **Avisos:**
  - O estoque mostra "Plano X: n de N carros", em amarelo a partir de 90% e
    em vermelho quando está cheio.
  - Na Vitrine, o link do catálogo do Facebook só aparece a partir do Revenda,
    e o feed responde 404 no plano Garagem.
- **Usuários e números:**
  - **Usuários ilimitados:** com plano da revenda, vale ilimitado, qualquer que
    seja o plano do Zap por baixo (`vagaDeAtendente`).
  - **Mais de um número:** o Revenda+ liga sozinho, e uma exceção explícita no
    Super Admin vence.
- **Vendedor IA:** o pacote contratado (até 300 por R$ 497, ou até 1.000 por
  R$ 997) é o teto. A loja pode baixar o próprio limite, nunca passar dele, e
  definir o pacote ajusta o limite da loja para baixo se estiver acima.
- **Sem plano** (empresas antigas, contrato sob medida): sem limites, como antes.
- **Cobrança:** o valor da assinatura continua sendo lançado à mão na
  cobrança. O painel mostra o total da tabela para conferir.

Implantação: `npm run db:push` (enum `PlanoVeiculos`, `VeiculosConfig.plano`,
`VendedorIaConfig.leadsContratados`) e redeploy do web e do
`vendedor-ia-worker`.

### Falta para fechar a fase 1
- **Contratos** de compra, venda e consignação em PDF, e recibo do sinal.
- **Alerta de carro parado** por push/aviso à gestão. Hoje ele é só visual.
- **Vínculo carro ↔ negociação do CRM** (`Negociacao.veiculoId`).
- **Desfazer venda concluída**: hoje só a reserva é cancelável. Venda errada se
  corrige no Financeiro e com a gestão.
- **RENAVE e NF-e** via parceiros (fase 1b), que dependem de contratar a
  integradora e o emissor.

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

Os planos abaixo foram conferidos na página de planos do site, em print enviado
em 11/11/2026. As funcionalidades da última tabela vieram do índice de busca.

| Plano | Preço | Estoque | CNPJs | Acessos | R$ por vaga de carro |
|---|---|---|---|---|---|
| Start | R$ 189,90/mês | até 25 veículos | 1 | 3 | 7,60 |
| Profissional ("mais popular") | R$ 299,90/mês | até 50 veículos | 1 | 5 | 6,00 |
| Avançado | R$ 499,90/mês | até 100 veículos | 2 | 10 | 5,00 |

**Incluído em todos os planos:** CRM com funil kanban, assistente virtual com
IA, site próprio em domínio personalizado, financeiro (contas a pagar e
receber), relatórios essenciais, vistoria digital com fotos, contratos digitais
em PDF, **Ordem de Serviço e Sinal de Negócio**, alertas e notificações, central
de suporte com chamados, SSL, backups e conformidade LGPD, **consulta veicular
integrada (CheckTudo)**, **integração RENAVE** e **simulação de financiamento
multibanco (F&I) com créditos vendidos por pacote**.

O menu do site tem **RENAVE, Consulta Veicular, Blog e FIPE como páginas à parte**,
marcadas com o ícone ↗ de link externo. São ferramentas públicas usadas como
isca de busca (SEO): o lojista vai consultar uma placa ou o valor FIPE e acaba
conhecendo o sistema.

Funcionalidades citadas no índice de busca (não conferidas):

| Área | O que diz oferecer |
|---|---|
| Estoque | Fotos, **precificação automática pela FIPE**, histórico de custos, **margem em tempo real**, **alerta de carro parado há mais de 30 dias** |
| Consignação | Proprietário, valor acordado, comissão e prazo |
| Fiscal | NF-e |
| Operação | Contratos com **assinatura eletrônica** |
| Integrações | OLX, Mercado Livre, Webmotors, **WhatsApp Business oficial** |
| Outros | App (rpmsystems.com.br/app), 100% nuvem, teste de 7 dias sem cartão |

**Leitura:**

- É o concorrente mais parecido com a nossa tese (CRM, IA, WhatsApp) e é
  **agressivo no preço**. Com 50 carros por R$ 299,90, empata com o valor de
  referência do Click Garage, entregando mais coisa.
- **Ponto fraco: limita acessos** (3, 5 ou 10). Uma revenda com 4 vendedores,
  1 gerente e 1 pessoa no financeiro já estoura o plano Profissional. Para um
  produto centrado no WhatsApp com vários atendentes, **usuários ilimitados é o
  nosso argumento direto**, e o Click Garage já usa esse argumento.
- **Modelo de receita por uso:** F&I em créditos por pacote e consulta veicular
  via parceiro (CheckTudo). Isso confirma a recomendação da seção 7 de integrar
  e revender por uso.
- **Isca de busca:** as páginas gratuitas de RENAVE, consulta veicular e FIPE
  trazem cliente. Click Garage e RPM fazem isso, e nós devemos fazer também
  (seção 8).

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
| 12b | **Sinal de negócio / reserva** (cliente paga sinal e o carro sai da vitrine) | 🟡 | `VendaVeiculo` em rascunho com o sinal como parcela recebida (mesmo mecanismo do sinal da OS da ótica) e status `RESERVADO` com prazo; o recibo do sinal vai pelo WhatsApp |
| 12c | **OS de preparação** (mecânica, funilaria, estética antes de anunciar) | 🟡 | Reaproveitar a ideia de etapas da OS da ótica: o carro anda por etapas até ficar `DISPONIVEL`, e cada serviço vira `CustoVeiculo` |
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
| **Consultas veiculares** | Parceiro, cobrado por consulta | Débitos, gravame, leilão, roubo e furto. Revender com margem. A RPM usa a CheckTudo; cote-a junto com uma ou duas alternativas |
| **Portais** | Fase 2: começar por **um integrador de anúncios**; APIs diretas depois, para os portais que mais trazem lead | Cada portal tem API, credenciamento e formato próprio. O que mais importa é **capturar o lead** (webhook ou leitura do e-mail do portal) e jogá-lo no Inbox |
| **Assinatura eletrônica** | Parceiro com API (Clicksign, ZapSign, Autentique etc.) | Enviar o link de assinatura pelo próprio WhatsApp |
| **Financiamento (F&I)** | Fase 3, via correspondente ou plataforma parceira | Começar com simulação simples (taxa × prazo) gerada no Inbox. A RPM já tem simulação **multibanco** vendida em **créditos por pacote**; considere o mesmo modelo |
| **IA ("ainda tem?")** | Fase 2 | Reaproveitar o padrão de uso de IA do SDR (`SdrIaConfig`, `SdrIaUso`, cache) para controlar custo por empresa |

---

## 8. Roteiro

| Fase | Prazo indicativo | Entrega | Objetivo comercial |
|---|---|---|---|
| **0. Validação** | 2 semanas | Entrevistar 5 a 10 revendas, testar Click Garage e RPM, fechar 1 ou 2 lojas piloto (como a Visuallis na ótica) | Confirmar dor e preço antes de codar |
| **1. MVP** | 6 a 8 semanas | Estoque, custos e margem, fotos, FIPE, entrada, venda, consignação, financeiro integrado, "Enviar carro" no Inbox, vitrine, contratos em PDF, alerta de carro parado | Piloto rodando a operação |
| **1b. Regulatório** | em paralelo | RENAVE e NF-e via parceiros | **Sem isso não dá para vender fora do piloto** |
| **1c. Isca de busca** | em paralelo, curto | Páginas públicas gratuitas de consulta FIPE e "minha loja está pronta para o RENAVE?", com captura de contato direto no Zap e no SDR | Gerar lead de lojista sem mídia paga, como Click Garage e RPM fazem |
| **2. Diferenciais** | +6 semanas | Captura de leads de portais no Inbox, publicação via integrador, IA "ainda tem?", interesse sem estoque, pós-venda automático, assinatura eletrônica, relatórios (giro, margem, vendedor) | Argumento de venda contra os concorrentes |
| **3. Escala** | depois | Avaliação no celular (PWA com câmera), multi-loja/CNPJ, simulação e ficha de financiamento, app do consignante, API oficial do WhatsApp como opção | Lojas médias e redes |

---

## 9. Preço e empacotamento

> **Tabela em vigor (12/11/2026): Garagem R$ 397, Revenda R$ 597, Revenda+
> R$ 897**, aplicada em `apps/web/lib/veiculos-planos.ts`. Os planos da
> revenda incluem o Zap inteiro (com usuários ilimitados), então nenhum pode
> custar menos que o Zap equivalente (Essencial R$ 297, Profissional R$ 497,
> Escala R$ 797). Os primeiros números (R$ 197/347/597) ficavam abaixo do
> próprio Zap e foram descartados. O histórico abaixo fica como registro do
> raciocínio contra a RPM.
>
> Contra o mercado, a tabela fica acima da RPM (R$ 189,90 a R$ 499,90, com
> 3, 5 e 10 acessos) e abaixo da AutoCerto completa (R$ 909, ou R$ 2.109
> com IA). O argumento de venda é a equipe inteira no WhatsApp da loja, não
> o preço.

### Histórico: primeira hipótese (descartada)

A primeira hipótese (R$ 249 por 30 carros) ficava **acima da RPM na entrada**,
que cobra R$ 189,90 por 25 carros. Revisão:

| Plano | Estoque | Usuários | Inclui | Preço sugerido | R$ por vaga de carro |
|---|---|---|---|---|---|
| **Garagem** | até 30 carros | **ilimitados** | Estoque, custos e margem, financeiro, Inbox (1 número), vitrine, FIPE, contratos, sinal/reserva | **R$ 197/mês** | 6,57 |
| **Revenda** | até 70 carros | **ilimitados** | + captura de leads dos portais, IA "ainda tem?", pós-venda, interesse sem estoque, relatórios | **R$ 347/mês** | 4,96 |
| **Revenda+** | até 150 carros | **ilimitados** | + multi-loja/CNPJ, SDR, relatórios avançados, opção de API oficial do WhatsApp | **R$ 597/mês** | 3,98 |

Por que esses números:

- **Contra a RPM, o argumento principal são os usuários ilimitados.** Uma loja
  com 6 pessoas precisaria do plano Avançado da RPM (R$ 499,90) só por causa dos
  acessos; no Zap, ela fica no Revenda (R$ 347). Mostre essa conta na página de
  planos.
- Com o mesmo número de carros, ficamos a R$ 5 a 10 da RPM, e não abaixo dela.
  Não vale brigar por centavos: o que justifica a diferença é o Inbox com vários
  atendentes, que a RPM não tem.
- **RENAVE incluso em todos os planos**, com franquia de operações, porque RPM e
  Click Garage dizem incluir e cobrar à parte viraria objeção.

Cobrados por uso, em créditos ou pacotes com margem, como a RPM faz com F&I:
consultas veiculares, simulações de financiamento, NF-e acima da franquia,
assinaturas eletrônicas e números de WhatsApp extras (`MULTI_NUMERO`).

Para entrar no mercado: implantação gratuita com migração da planilha ou do
sistema anterior, 14 dias grátis sem cartão (a RPM dá 7 e o Click Garage dá 15)
e sem fidelidade. O argumento de troca é *"traga seu estoque e seu WhatsApp,
estamos rodando em 1 dia"*.

Antes de fechar os preços, valide com as lojas piloto se elas pagariam
**R$ 50 a R$ 100 a mais** por "nenhum lead sem resposta". Se pagarem, o plano
Revenda pode subir para R$ 397.

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

1. Criar contas de teste na RPM (7 dias) e no Click Garage (15 dias) e
   cronometrar o caminho "lead → resposta → visita → venda". Os planos da RPM já
   foram conferidos; o restante veio do índice de busca.
2. Escolher 1 ou 2 revendas piloto da rede de contatos.
3. Pedir proposta a duas integradoras de RENAVE e a dois emissores de NF-e (preço
   por operação, SLA e suporte a consignação).
4. Aprovar o modelo de dados da seção 6.2 e abrir a fase 1.

## Fontes

- [Click Garage](https://clickgarage.com.br/) · [Planos](https://clickgarage.com.br/planos) · [RENAVE Click Garage](https://renave.clickgarage.com.br/) · [Renave SP](https://renavesp.com.br/) · [Sistema Loja de Veículos](https://sistemalojadeveiculos.com.br/)
- [RPM Systems](https://rpmsystems.com.br/) · [App RPM](https://rpmsystems.com.br/app)
- [RENAVE obrigatório 2026 (Rede Cred Auto)](https://blog.redecredauto.com.br/renave-obrigatorio-veja-o-que-muda-em-2026/) · [O que é RENAVE (Revenda Mais)](https://revendamais.com.br/blog/o-que-e-renave-registro-nacional-de-veiculos-em-estoque/) · [AG TV](https://www.agtv.com.br/post/72715/34historico-contran-torna-o-renave-obrigatorio-em-todo-o-brasil-e-inicia-uma-nova-era-para-o-mercado-automotivo34) · [Simples Veículo, RENAVE](https://simplesveiculo.com.br/renave-obrigatorio/)
- [AutoCerto](https://autocerto.com/) · [Simples Veículo](https://simplesveiculo.com.br/) · [GoRevenda](https://gorevenda.com.br/) · [Velix](https://www.velix.autos/) · [System4R](http://www.system4r.com.br/2.0/) · [Spice Digital](https://spicedigital.com.br/integrador) · [Gestor Revenda](https://www.gestorrevenda.com.br/) · [StockCarWeb](https://stockcarweb.com.br/) · [Boom Sistemas](https://lp.boomsistemas.com.br) · [AutoSDR](https://blog.autosdr.com.br/blog/melhor-crm-concessionaria-motos-caminhoes-2025)

## Completar o cadastro e fotos leves (v1.63.0)

- **Veículos > Completar** (gestão): tabela só com os carros sem quilometragem informada (ou sem preço). A equipe digita a km (Tab para o próximo) e usa **Salvar** ou **Salvar e colocar à venda** (os que estão em preparação e ficaram com preço e km passam a disponível; em loja que não exige km, basta o preço). Km 0 conta como informada. Vai para o histórico do carro. Código: `lib/veiculos-completar.ts`, rota `POST /api/veiculos/completar`.
- **Km em massa (v1.113.0)**: a tela **Completar** ganhou um bloco "Colar a km de uma planilha ou baixar a lista". **Baixar a lista (CSV)** traz placa e carro dos que estão sem km (abre no Excel) para levar ao pátio. **Colar** uma linha por carro com a placa e a km (ex.: `LSE7D72 84203`, com ou sem hífen, ponto ou "km") preenche a tabela pela placa; nada é salvo até clicar em **Salvar**. **Enter** desce para o carro de baixo. Avisos que não bloqueiam: km abaixo de 500 em carro de ano anterior, e o mesmo valor digitado em 4 ou mais carros (sinal de número padrão). A regra continua: **a km é a lida no odômetro**, o Zap não preenche valor por conta própria e o comprador vê esse número no anúncio. Código: `lib/veiculos-completar-km.ts`.
- **Fotos leves na vitrine**: `/api/loja/<slug>/fotos/<id>?w=240|480|800|1200` devolve WebP redimensionado (respeita a orientação do celular, não amplia, cache em memória de 150 MB e `Cache-Control` de 1 dia). Sem `w`, continua redirecionando para a original (portais, feeds e sitemap). Lista, galeria e capa do compartilhamento usam as versões leves com `srcset`. Se o redimensionamento falhar, cai para a original. Dependência nova: `sharp` (apps/web).

## Busca pela placa (v1.71.0)

Na entrada e na ficha do veículo, ao lado da placa, o botão **"Buscar pela placa"** (gestão) preenche marca, modelo, versão, anos, cor, combustível, câmbio, portas, chassi, renavam e código FIPE; km, preço e opcionais ficam como estão, e a tela pede para conferir a versão. Só características do carro: **nenhum dado do proprietário** é pedido nem guardado.

- **Provedores** (`apps/web/lib/placa.ts`), na ordem: (1) um provedor HTTP configurado por variável: `PLACA_API_URL` com `{placa}` no lugar da placa (o token pode ir na própria URL) e, se precisar, `PLACA_API_HEADERS` (JSON de cabeçalhos). A resposta é lida de forma tolerante (campos em português ou inglês, em qualquer nível; "CHEVROLET/PRISMA" vira marca e modelo; "Gasolina/Álcool" vira Flex). (2) A **MobiAuto**, se a loja tem a conta conectada (`GET /api/vehicle/v1.0/plate/{placa}`: marca, modelo, versão, ano, combustível, chassi, FIPE).
- **Cache** de 90 dias por placa (`ConsultaPlaca`, só as características): a mesma placa não é cobrada duas vezes.
- Sem nenhum provedor, o botão avisa "A busca pela placa ainda não está liberada nesta conta".
- **Pendente**: contratar um provedor de dados de veículo por placa (cobrança por consulta) e configurar `PLACA_API_URL`; o leitor tolerante deve aceitar a maioria, mas convém conferir com a resposta real do provedor escolhido (testado só com respostas simuladas).

## Cadastro no jeito do AutoCerto (v1.84.0)

A entrada e a ficha do carro ganharam o que o cadastro do AutoCerto tem (é o que a equipe das lojas conhece):

- **Buscar pela placa** (v1.71.0, trazido para a versão atual): consulta a MobiAuto quando a conta da loja está conectada (ou um provedor configurado em `PLACA_API_URL`) e preenche marca, modelo, versão, anos, combustível, chassi e FIPE. Sem provedor, o botão avisa que a consulta ainda não está disponível. Cache de 90 dias por placa (`ConsultaPlaca`).
- **Características** em etiquetas (7 lugares, IPVA pago, único dono, revisado em concessionária…) e **opcionais** em caixas de marcar, com busca, "Marcados (n)", "Marcar todos" e "Outro opcional" para o que não está na lista (`lib/veiculos-cadastro.ts`).
- **Carroceria**, **Veículo 0 km**, **km "Não mostrar no site"** (o site trata como não informada; os portais continuam recebendo) e **vídeo do YouTube** (aparece na página do carro, por `youtube-nocookie`).
- **Preço no site** e **preço nos classificados** (vazio = o mesmo; "Copiar do site"), **observação no site** com "Usar a mesma observação nos classificados" e **Diferente em algum portal** (preço e/ou observação só na OLX, Webmotors, MobiAuto ou NaPista). Os quatro conectores passam o carro por `paraOPortal` (`packages/portais/src/ajustes.ts`) antes de montar o anúncio; o hash sai do resultado, então mudar um ajuste reenvia só ao portal afetado.
- **Observação padrão** (Aparência e domínio > Observação padrão dos anúncios): já vem escrita em todo carro novo.
- **Qualidade do anúncio** (0 a 100%, com o que falta) e **Dar entrada e começar outro**.

Campos novos em `Veiculo`: `caracteristicas`, `carroceria`, `zeroKm`, `ocultarKm`, `videoUrl`, `precoClassificadosCents`, `descricaoClassificados`, `ajustesPorPortal`; em `VeiculosConfig`: `observacaoPadrao`. Teste: `apps/web/lib/veiculos-cadastro.test-manual.ts`.

## Relatórios (v1.86.0)

**Veículos > Relatórios** (só a gestão), no jeito do AutoCerto:

- **Estoque**: carros no pátio do mais antigo ao mais novo, com situação, dias, km, preço, FIPE, custo lançado (consignado: o que o dono recebe + gastos), margem prevista, fotos e em quais portais está no ar; cartões de quantidade, valor à venda, idade média (alerta com 90 dias ou mais) e carros sem fotos; **planilha CSV** para o Excel.
- **Visitas no site**: visitas, cliques no WhatsApp, formulários e a taxa que virou contato, com gráfico por dia e os carros mais vistos (7, 30 ou 90 dias, comparado ao período anterior).
- **Integração**: por portal, se a conta está conectada, quantos anúncios no ar, na fila e com erro, e quantos carros à venda estão fora dele; lista dos anúncios com erro e a mensagem do portal.
- **Desempenho por veículo**: carros à venda com visitas, WhatsApp, formulários e leads dos portais no período, ordenados por contatos, com alerta para "muitas visitas e nenhum contato" e "parado sem contato".

**Contagem do site** (nova, começa a valer com esta versão): `EstatisticaVitrine` guarda só números por dia e por carro (visitas, cliques em qualquer link de WhatsApp do site, formulários). A visita conta uma vez por página por sessão do navegador; robôs e pré-visualizações (Google, WhatsApp, navegadores automatizados) não contam; nada do visitante é guardado. Rotas: `POST /api/loja/[slug]/evento` (público) e `GET /api/veiculos/relatorios?tipo=…`. Teste: `apps/web/lib/relatorios-veiculos.test-manual.ts`.

## Primeiros passos e implantação (v1.93.0)

Padroniza a implantação de uma revenda nova (Sprint 1 do plano de evolução do Motors).

- **Primeiros passos** (`lib/primeiros-passos.ts`): checklist **calculado na hora** a partir dos dados da loja, sem nada guardado e sem marcar à mão. Sete passos obrigatórios: dados da loja, estoque no sistema, carros prontos para anunciar (preço, km e foto), WhatsApp conectado, equipe com login, site no ar e equipe atendendo pelo Inbox (mensagens de gente da equipe nos últimos 14 dias). Dois opcionais, que não entram na porcentagem: portais conectados (com anúncios no ar) e Vendedor IA (só aparece se a empresa o contratou). Cada passo tem o que o sistema viu, **por que importa** e **como fazer**, e serve também como material de capacitação de quem implanta.
- **Para a gestão da loja:** aba **Veículos > Primeiros passos** e um cartão no topo do Estoque ("Implantação 43% · próximo: …"), que some quando a implantação termina. Rota `GET /api/veiculos/primeiros-passos` (tenant sempre da sessão).
- **Para a Dilon Tech (Super Admin):** painel "Implantação da revenda" na ficha da empresa e a página **Implantação de revendas** (`/admin/implantacao`), com todas as revendas, porcentagem, dias desde a entrada, carros sem km e o que falta; quem entrou há mais tempo e não terminou aparece primeiro. Rotas `GET /api/admin/tenants/[id]/implantacao` e `GET /api/admin/implantacao`.
- **`GET /api/health`** (público, sem dado de empresa): versão e se o banco responde (503 se não). Serve para monitor de disponibilidade e para conferir o deploy.

Sem mudança de banco. Teste: `apps/web/lib/primeiros-passos.test-manual.ts` (19 checagens, incluindo isolamento entre empresas e o recurso de Vendedor IA).

## Preço "Sob consulta" e km "n/a" no site (v1.94.0)

Para lojas que preferem negociar o valor e a km no atendimento (pedido da Sales). Duas camadas, somadas:

- **Da loja inteira** (Aparência e domínio > Preço e quilometragem no site): "Mostrar Sob consulta no lugar do preço" e "Mostrar Km n/a no lugar da quilometragem", para todos os carros (`VeiculosConfig.ocultarPrecoNoSite` e `ocultarKmNoSite`).
- **De um carro** (ficha ou entrada do carro): "Sob consulta no site" ao lado do preço (`Veiculo.ocultarPreco`) e "Km n/a no site" ao lado da km (`Veiculo.ocultarKm`, que já existia).

**O que muda:** só o que o visitante vê. Preço e km somem do cartão, da página do carro, do popup de oferta, do título e da descrição que o Google mostra, dos dados estruturados (sem preço não há oferta declarada), do `llms.txt`, das páginas de marca ("a partir de" só conta os carros com preço à mostra) e dos feeds públicos (XML e JSON trazem `preco: null` e a marca de sob consulta). Sem carro com preço, o site esconde os filtros de valor; carro sob consulta continua aparecendo quando alguém filtra por valor e vai para o fim ao ordenar por preço.

**O que NÃO muda:** o valor real continua no banco e vai para os **portais** (Webmotors, MobiAuto, NaPista e OLX exigem preço e km), CRM, relatórios e a ficha interna. O **catálogo do Facebook e Instagram** não aceita item sem preço, então carro sob consulta fica fora dele.

**Vendedor IA e WhatsApp:** a ficha que a IA envia diz "Valor sob consulta" e "Km n/a", e a ferramenta de estoque avisa a IA para não informar nem estimar o valor (o filtro de preço da IA também não lista carro sob consulta, para não revelar o valor por eliminação). O botão "Enviar carro" do Inbox continua mandando a ficha completa, porque é uma decisão da pessoa da equipe.

A regra é aplicada na origem de todo dado público (`aplicarPrivacidade`, em `lib/vitrine.ts`): o preço sai do objeto (vira 0), então um lugar esquecido não vaza o número. Campos novos (só acréscimo): `Veiculo.ocultarPreco`, `VeiculosConfig.ocultarPrecoNoSite`, `VeiculosConfig.ocultarKmNoSite`. Teste: `apps/web/lib/vitrine-privacidade.test-manual.ts`.

### Onde mudar (v1.94.1)

A opção da loja inteira ganhou uma aba própria: **Veículos > Meu site > Preço e km no site** (salva na hora, sem passar pela tela de configurações). A seção da tela "Aparência e domínio" continua existindo e grava os mesmos campos. Para esconder só alguns carros: ficha do carro > editar dados > "Sob consulta no site" ao lado do preço e/ou "Km n/a no site" ao lado da quilometragem.

## Painel de leads (v1.99.0)

**Veículos > Leads** (só a gestão): o que o AutoCerto chama de Painel, mas numa tela só e respondendo à pergunta "quem eu preciso
atender agora?". Código: `apps/web/lib/painel-leads.ts`, rota `/api/veiculos/leads/painel?dias=7|30|90`, tela
`veiculos/leads/painel-de-leads.tsx`, teste `lib/painel-leads.test-manual.ts`.

- **Precisa de atenção:** leads dos portais sem resposta nos últimos 30 dias (qualquer que seja o período escolhido), o mais novo primeiro
  (ainda está quente), com "Abrir conversa" (leva ao Inbox) e "Já respondi".
- **Cartões:** leads recebidos (e variação sobre o período anterior), sem resposta agora, tempo típico da 1ª resposta (mediana) e % respondido em
  até 15 min. Usa a mediana porque a média engana: um lead de 4 dias estraga dez respondidos em 5 minutos.
- **Tempo de resposta:** faixas do AutoCerto (até 15 min excelente, até 30 atenção, mais que isso crítico). Sem resposta há mais de 30 min conta
  como crítico; antes disso é "aguardando".
- **Origem dos leads** (portal, %, tempo típico, vendas ganhas), **Vendedores** (leads, sem resposta, tempo típico) e leads por dia (14 dias).
- **Como conta "respondeu":** não depende de apertar botão. Vale a primeira mensagem de uma **pessoa** da loja (Inbox ou celular) ou do
  **Vendedor IA** no WhatsApp depois que o lead chegou (a conversa vem da negociação do lead), ou o "Já respondi" (ligação). Mensagem automática
  (menu, saudação) e mensagem que falhou no envio não contam; mensagem de antes do lead também não.
- **Limites:** lead sem negociação (sem telefone) só conta como respondido pelo "Já respondi". Lê até 5.000 leads da janela. Só leitura: nada
  aqui manda mensagem. Sem mudança de schema.
- A resposta imediata ao lead do portal (v1.100.0) está descrita em `docs/vendedor-ia.md`; sem ela o lead só vira negociação e tarefa de chamar.

## Simulador de financiamento (v1.103.0)

Botão **Financiar** no cabeçalho da conversa do Inbox (ao lado de "Carro", só com o recurso de veículos): o vendedor escolhe o carro (ou
digita o valor), define a entrada (com atalhos de 20, 30, 40 e 50%) e digita a **taxa ao mês que o banco da loja pratica**. Mostra a parcela, o
total pago e os juros em 12, 24, 36, 48 e 60 meses (tabela Price) e leva o texto para o campo da conversa ou copia.

- **É estimativa:** não consulta banco, não aprova crédito e não inclui IOF, tarifas nem seguro. O texto que vai ao cliente diz isso e mostra a
  taxa usada. Diferente do simulador do AutoCerto (tabelas do banco Safra), que exige contrato de parceria; esta versão não tem custo.
- **Taxa:** nunca vem preenchida por nós (não temos taxa de mercado confiável); fica lembrada só neste navegador. Recusa taxa acima de 10% ao mês
  (erro de digitação) e entrada igual ou maior que o valor.
- Código: `lib/financiamento.ts` (conta e texto, testado em `lib/financiamento.test-manual.ts` com valores conferidos à parte),
  `components/simulador-financiamento.tsx`. Sem mudança de schema nem de worker; nada é gravado.
- Próximos passos possíveis: guardar a taxa por loja, botão na ficha do carro e, se houver cliente que pague, tabelas de banco por parceria.

## Painel do estoque (v1.104.0)

**Veículos > Painel** (primeira aba, só a gestão): a visão do dono sobre o pátio, no espírito do painel do AutoCerto. Código:
`apps/web/lib/painel-estoque.ts`, rota `/api/veiculos/painel`, tela `veiculos/painel/painel-do-estoque.tsx`, teste
`lib/painel-estoque.test-manual.ts`. Só leitura; sem mudança de schema.

- **Cartões:** estoque total (e quantos estão publicados), idade média, mais de 60 dias no pátio e carros à venda fora do site.
- **Recomendações** (cada uma abre a lista dos 15 carros mais antigos, com link para a ficha): à venda sem publicação; parados há 90 dias ou
  mais e acima da FIPE (com a % ao lado); sem preço; sem quilometragem; sem fotos; anúncios com problema nos portais. Lista vazia mostra "Nenhum ✓".
  Mostra também a qualidade média dos anúncios (a mesma nota da ficha do carro).
- **Dias em estoque** (0–30, 31–60, 61–89, 90 ou mais), os três mais antigos, e **Preço × FIPE** (abaixo = 5% ou mais abaixo; acima = mais de 10%
  acima; carro sem FIPE ou sem preço fica fora da conta).
- **Definições:** "publicado" = aparece no site ou tem anúncio publicado em portal; "problema nos portais" = anúncio com erro ou parado na fila
  há mais de 1 hora. O preço "sob consulta" no site não conta como "sem preço" (só vale o carro sem preço de verdade).
- **Fora desta versão** (vem do painel do AutoCerto): grade com uma coluna por portal e plano de anúncio de cada carro, uso do plano de cada
  portal e o botão "Atualizar" por portal.

## Grade de anúncios por portal (v1.105.0)

**Veículos > Anúncios** (só a gestão, logo depois de Estoque): o que o AutoCerto mostra na consulta do estoque, com uma coluna por portal.
Código: `apps/web/lib/grade-portais.ts`, rota `/api/veiculos/anuncios` (GET a grade, POST "publicar os que faltam"), tela
`veiculos/anuncios/grade-de-portais.tsx`, teste `lib/grade-portais.test-manual.ts`. Sem mudança de schema nem de worker.

- **Cartões por portal** (só os portais com conta da loja ou com anúncio já feito): conectado ou não, publicados, na fila, com erro e quantos
  carros à venda estão fora do portal, com o botão **Publicar os N que faltam** (pede confirmação e avisa que cada anúncio pode ocupar uma vaga
  do plano da loja no portal e quantos estão sem km).
- **Linhas:** um carro à venda por linha (disponível e reservado), com a célula de cada portal: Publicado, Na fila, Com erro (com o motivo) ou
  Não anunciado, o plano do anúncio quando há (Webmotors), "ver" o anúncio, e **Publicar / Tirar** por carro (só nos disponíveis e com a conta
  conectada). Filtros: busca, faltando em algum portal, com erro.
- **Segurança:** os ids vêm do navegador; a rota só aceita carros À VENDA da loja da sessão, exige a conta do portal conectada e registra a
  ação em auditoria. Usa as mesmas funções de anúncio da ficha do carro (`anunciarNa*`), então vale a regra de que carro sem km não sobe.
- **Fora desta versão:** escolher o plano do anúncio de cada carro (Ouro, Prata, Bronze...) e o uso de vagas por plano em cada portal (como o
  "9 de 13" do MobiAuto no AutoCerto); hoje só a Webmotors tem plano padrão da loja, e a grade mostra o plano quando já existe.

### Grade no jeito do AutoCerto, primeira entrega (v1.116.0)

A grade de **Veículos > Anúncios** ficou mais perto da consulta de estoque do AutoCerto, que o Sales usa e compara:

- **Números por portal no topo:** "54 de 67 no ar" com barra (publicados sobre os carros à venda), na fila, com erro e fora do portal. O limite do plano de cada portal não aparece porque os portais não o informam à integração.
- **Linha completa do carro:** foto de capa com os **dias no pátio em cor** (cinza até 60, âmbar até 90, vermelho depois, o mesmo corte do painel do estoque), marca, modelo e ano, versão, **placa**, status na vitrine (Na vitrine, Fora da vitrine, Reservado) e os **dois preços**: Site e Classificados (igual ao site quando não há preço de classificados).
- **Corrigir ali mesmo:** clicar no **preço do site** ou na **km** abre um campo; Enter salva e Esc cancela. Usa a mesma rota da tela Completar (`POST /api/veiculos/completar`), então fica no histórico do carro. Km abaixo de 500 em carro de ano anterior mostra aviso.
- **Busca e filtros:** busca por marca, modelo, versão ou placa (sem acento, placa com ou sem hífen); filtros com contagem (Faltando em portal, Com erro, Sem km, Sem foto, Parados +60 dias, Reservados); filtro por portal; ordenação (mais ou menos tempo no pátio, preço, marca e modelo, placa).
- **Células por portal:** verde quando publicado, vermelho quando com erro (com o motivo), **Ver anúncio** e **+ Publicar** / **Tirar**.
- Regras em `lib/grade-portais-filtros.ts` (puras, testadas em `lib/grade-portais-filtros.test-manual.ts`). Sem mudança de schema nem de worker.
- **Próximas entregas:** "Atualizar agora" por portal com a contagem de pendentes, exportar para CSV e imprimir, e escolher o plano do anúncio por célula.

## Importar o controle de vendas da planilha (v1.110.0)

Para lojas que ainda controlam as vendas numa planilha (uma aba por mês), **Veículos > Importar > "Importar o controle de vendas"** traz o histórico para dentro do Zap.

- **Arquivo:** `.xlsx` com abas JANEIRO, FEVEREIRO… e colunas DATA, PLACA, VEICULO, MODELO/ANO, RENAVAM, CHASSI, COR, NOME DO COMPRADOR, ENDEREÇO, TELEFONE, RG, CPF, VALOR FINANCIADO, ENTRADA, FINANCEIRA, PRAZO, PARCELA, KM. Aceita data como número do Excel ou texto `dd/mm/aaaa` e cabeçalho de data em branco. As abas de transferência, IPVA, financiamento externo e repasse são ignoradas (por enquanto).
- **O que cria, por linha:** o carro como VENDIDO (fora da vitrine, não ocupa o limite do plano), o comprador como contato (nome, telefone, CPF, RG e endereço) e uma venda CONCLUÍDA com a data da venda, o banco e o financiado. Nada de financeiro (contas a pagar/receber) é criado e o WhatsApp não é consultado.
- **Valor aproximado:** a planilha não traz o preço. O valor da venda é financiado + dinheiro da entrada. Boleto e carro na troca não entram. A venda importada diz isso nas observações. Vendedor e origem do cliente ficam em branco; o "tempo em estoque" dos carros importados não vale (usamos a data da venda).
- **Segurança:** em dois tempos (Conferir, depois Importar). Idempotente: enviar a mesma planilha de novo não duplica (conferido por carro + dia). Carro da planilha que ainda está no estoque do Zap vira "conflito" e não é importado. Linhas sem placa válida, comprador ou telefone são listadas. Só a gestão; sempre na empresa da sessão; fica no log de auditoria.
- **Dados pessoais (LGPD):** CPF, RG e endereço dos compradores ficam só no contato da empresa, como os demais dados do cliente.
- **Indicadores:** Veículos > Relatórios > **Vendas** (12 meses): vendas e valor por mês, ticket médio, % financiado, modelos, marcas e financeiras.
- **Teste do interpretador:** `cd apps/web && npx tsx --tsconfig tsconfig.json --test lib/importar-vendas.test.ts`.
