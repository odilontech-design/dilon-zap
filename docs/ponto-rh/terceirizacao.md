# Dilon Ponto para Terceirização (facilities, limpeza, segurança)

Vertical do Dilon Ponto para empresas de **mão de obra distribuída em postos**
de clientes: asseio e conservação, segurança patrimonial, portaria, facilities,
manutenção. É o mercado atendido pela Nexti, pela Pontotel e pelos módulos de
terceirização dos grandes ERPs.

A referência de operação é a de uma terceirizada com mais de 10 mil
colaboradores em 19 estados, que tinha um **CSC** (centro de serviço
compartilhado) com uma **mesa de operação** dedicada ao tratamento diário do
ponto e **pontos focais** na operação. O desenho abaixo transforma essa rotina
em produto, para que uma terceirizada média tenha o mesmo controle sem montar
um CSC inteiro.

> Uso comercial: prospectar terceirizadas em geral. Não é uma oferta dirigida a
> uma empresa específica.

## 1. A dor

- **O colaborador é da terceirizada, mas trabalha no cliente.** As horas, as
  faltas e o espelho precisam sair por **posto** e por **contrato/centro de
  custo**, porque é assim que a terceirizada fatura o cliente e responde a ele.
- **Posto descoberto é dinheiro perdido.** O contrato prevê o posto ocupado;
  falta sem cobertura vira glosa (desconto) na fatura e desgaste com o cliente.
- **Volume diário.** Com centenas ou milhares de pessoas, conferir o ponto no
  fim do mês não fecha a folha a tempo. As pendências precisam ser tratadas
  todo dia.
- **Quem está no campo não é quem decide.** O ponto focal ou supervisor sabe o
  que aconteceu no posto; a mesa de operação (ou o DP) decide e responde pela
  regra. Sem um fluxo, isso vira WhatsApp, planilha e e-mail.
- **Escalas do setor:** 12x36, 6x1, 5x2 e revezamento, com a convenção coletiva
  de cada estado (asseio e conservação, vigilância).

## 2. O fluxo: requisição do ponto focal, decisão da mesa

```
Ponto focal (campo)  ──abre requisição──▶  Mesa de operação (CSC / DP)
       ▲                                         │
       └──────── aprovada / recusada ◀───────────┘
                 (com motivo)                    │
                                       aprovada: vira tratamento no ponto
                                       (inclusão, desconsideração, abono)
```

- O **ponto focal não ajusta o ponto**. Ele abre uma **requisição** com o
  colaborador, a data, o tipo, a justificativa e o anexo (atestado, foto,
  declaração do cliente).
- A **mesa de operação** aprova ou recusa, sempre com motivo. A aprovação cria
  o tratamento no ponto pelos mecanismos que já existem (inclusão ou
  desconsideração com motivo, abono), e a marcação original continua intacta.
- Tudo fica na trilha de auditoria: quem pediu, quando, quem decidiu e por quê.
- Prazo de atendimento (SLA) por tipo de requisição, com a fila ordenada pelo
  que vence primeiro e pelo que trava o fechamento.

### Tipos de requisição

| Tipo | Efeito se aprovada |
| --- | --- |
| Inclusão de marcação (esqueceu, celular sem bateria) | Tratamento de inclusão |
| Desconsideração de marcação (registro duplicado ou errado) | Tratamento de desconsideração |
| Atestado / abono | Abono no período, com o anexo |
| Falta justificada ou não justificada | Classifica a ausência |
| Cobertura de posto (quem cobriu quem) | Liga o cobrista ao posto e ao colaborador ausente |
| Troca de escala ou de folga | Altera a escala do dia |
| Hora extra (justificativa) | Registra a justificativa; a hora extra **nunca** depende de autorização prévia para ser registrada (Portaria 671, art. 74) |

### A fila diária da mesa

Além das requisições, o sistema gera sozinho as **pendências do dia**, para a
mesa tratar antes que virem problema na folha:

- marcação ímpar (entrou e não saiu);
- falta sem requisição;
- atraso ou saída antecipada acima da tolerância;
- hora extra acima do limite diário;
- interjornada ou intervalo abaixo do mínimo;
- **posto descoberto** (escala prevista e ninguém marcou no posto).

Cada pendência pode ser resolvida pela mesa, mandada ao ponto focal pedindo
informação ou encerrada como "sem ação", sempre com motivo.

## 3. Estrutura da empresa

```
Grupo (vários CNPJs)
 └── Empresa / CNPJ  (estabelecimento do REP-P: NSR e AFD por estabelecimento)
      └── Regional / Estado   (feriados estaduais, convenção coletiva)
           └── Contrato / Centro de custo   (cliente da terceirizada)
                └── Posto   (endereço, cerca virtual, escala prevista)
                     └── Colaboradores alocados (titular, cobrista, folguista)
```

- **Feriados** nacionais, estaduais e municipais, pelo local do posto.
- **Convenção coletiva** por regional: tolerâncias, adicionais, regras de
  12x36.
- **Cerca virtual por posto:** a marcação registra se foi feita dentro ou fora
  do raio do posto. Fora do raio vira pendência; o registro nunca é bloqueado
  (Portaria 671, art. 74: sem restrição à marcação).

## 4. Perfis de acesso

| Perfil | Vê | Faz |
| --- | --- | --- |
| **Colaborador** | o próprio ponto, espelho e comprovantes | registra o ponto |
| **Ponto focal / supervisor** | os postos e colaboradores sob ele | abre requisições, vê quem está no posto agora, informa cobertura |
| **Mesa de operação (CSC / DP)** | todos os postos da regional ou da empresa | aprova ou recusa requisições, trata pendências, fecha o período |
| **Gestor de contrato** | indicadores dos contratos dele | acompanha cobertura, faltas e horas por contrato |
| **Administrador** | tudo | regras, estrutura, usuários, integrações |

## 5. Painéis

- **Agora:** quem está em cada posto, postos descobertos e atrasos do turno,
  no celular do supervisor.
- **Mesa:** fila de requisições e pendências por prazo, com contagem do que
  trava o fechamento.
- **Contrato:** horas, faltas, coberturas e tempo de posto descoberto por
  contrato e por mês, para a conferência da fatura com o cliente.

## 6. Integração com o sistema de DP

Posicionamento comercial: **o Dilon Ponto integra com o sistema de folha e DP
que a empresa já usa** (TOTVS Protheus, TOTVS RM, Senior, ADP, Domínio,
Questor, Sankhya, planilhas próprias ou qualquer outro). Não há integração
pronta com nenhum ERP: cada uma é feita como projeto de implantação, por um
destes caminhos, do mais simples ao mais completo:

1. **Arquivo:** exportação das horas apuradas no layout de importação da folha
   do cliente e importação do cadastro em planilha. Atende a maioria dos casos
   e já é possível hoje com os relatórios e o AFD/AEJ.
2. **API:** o Dilon Ponto expõe uma API para o sistema do cliente enviar o
   cadastro (colaboradores, centros de custo, funções) e buscar as horas
   apuradas e as marcações.
3. **Conector dedicado:** leitura agendada do ERP do cliente (por exemplo, a
   carga de funcionários e centros de custo do Protheus) e envio do
   fechamento para o módulo de ponto ou folha dele.

Sentido dos dados, quando houver integração:

- **ERP → Ponto:** colaboradores (admissão, desligamento, função), centros de
  custo e lotação. O ERP é a fonte do cadastro.
- **Ponto → ERP:** horas apuradas por evento (normais, extras, noturnas,
  faltas, DSR, banco) e, se a folha pedir, as marcações tratadas.

Preço da integração: cobrado como implantação, por orçamento.

## 7. O que já existe e o que falta

| Peça | Situação |
| --- | --- |
| Registro pelo app com localização e foto, offline | pronto |
| Cálculo da CLT, banco de horas, noturno, interjornada | pronto |
| Tratamento com motivo sem apagar o original, auditoria | pronto |
| REP-P: NSR, AFD, AEJ, comprovante, ATRT | pronto |
| Relatórios e planilha para a folha | pronto |
| Vários CNPJs, regionais, feriados estaduais e municipais | falta |
| Contrato / centro de custo e posto, cerca virtual por posto | falta |
| Escalas 12x36, 6x1 e revezamento, cobrista e folguista | falta |
| Requisições do ponto focal e decisão da mesa | falta |
| Pendências diárias e posto descoberto | falta |
| Perfis ponto focal, mesa e gestor de contrato | falta |
| Painéis Agora, Mesa e Contrato | falta |
| API de cadastro e de horas; exportação por layout de folha | falta |

## 8. Fases

1. **Estrutura e escalas:** CNPJs, regionais, contratos, postos, escalas
   12x36/6x1, feriados por local, cerca virtual por posto.
2. **Requisições e mesa:** ponto focal, mesa de operação, fila de pendências,
   SLA, painel Agora.
3. **Cobertura e contrato:** cobrista/folguista, posto descoberto, painel por
   contrato.
4. **Integração:** API e exportação por layout; o primeiro conector é feito
   para o primeiro cliente que pedir.

## 9. Comercial

- **Cliente ideal:** terceirizadas de 200 a 2.000 colaboradores, com vários
  contratos e sem CSC estruturado. As grandes (acima de 5 mil) já têm sistema
  implantado e ciclo de venda longo; entram depois, com piloto numa regional
  ou num contrato.
- **Argumento:** "a mesa de operação pronta": o fluxo de requisição e
  aprovação, a fila diária e o controle de posto descoberto que as grandes
  montam com equipe própria.
- **Preço (hipótese):** por colaborador ativo, na faixa do plano Ponto
  (R$ 7 a R$ 9), com desconto por volume acima de 500 colaboradores;
  implantação e integração à parte. Validar com 3 a 5 terceirizadas antes de
  publicar.
- **Concorrência:** Nexti (foco em postos distribuídos, sem preço público),
  Pontotel (página própria para segurança, facilities e asseio; plano básico
  publicado a partir de R$ 153 para até 10 colaboradores), módulos de
  terceirização da TOTVS e de outros ERPs.
