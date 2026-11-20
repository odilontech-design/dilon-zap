# Especificação do produto — Dilon Ponto

Cada módulo traz o código da fase em que entra: **F1** é o MVP, **F2** a
conformidade e o registro avançado, **F3** o DP e **F4** escalas e risco. As
fases estão descritas em [`arquitetura-e-roadmap.md`](./arquitetura-e-roadmap.md).

## 1. Perfis de acesso

| Perfil | Pode | Não pode |
| --- | --- | --- |
| **Administrador** | Tudo: configurações, cadastros, regras de jornada, fechamento, relatórios, cobrança e usuários | — |
| **Gestor** | Ver a equipe dele (e só ela), aprovar e recusar solicitações, receber alertas, ver indicadores da equipe e ajustar ponto se o administrador liberar | Mudar regras, fechar período, ver outras equipes |
| **Colaborador** | Bater ponto, ver o próprio espelho e saldo, abrir solicitações, assinar o espelho e documentos | Ver dados de colegas |
| **Contador** (convidado) | Ver fechamentos e exportar arquivos de todas as empresas que o convidaram | Alterar marcações ou regras |

O gestor pode ser também colaborador: o mesmo login enxerga as duas visões.

## 2. Registro de ponto

### 2.1 Canais

| Canal | Como funciona | Fase |
| --- | --- | --- |
| **App do colaborador (PWA)** | Celular do funcionário. Entrada por botão grande, com selfie e localização. Funciona sem internet e sincroniza depois. | F1 |
| **Web** | Navegador do computador, para quem trabalha no escritório. Opção de exigir IP da empresa. | F1 |
| **Quiosque coletivo** | Tablet, celular ou computador da empresa no modo quiosque. O funcionário se identifica pelo rosto, por QR code do crachá ou por PIN, e uma foto é tirada. | F2 |
| **WhatsApp** | O colaborador manda "entrada", "saída", "intervalo" ou "volta" para o número da empresa, com selfie e localização, e recebe o comprovante. | F2 |

### 2.2 Modos de validação (configuráveis por empresa, equipe ou colaborador)

- **Simples:** só o botão. Para a confiança total ou o computador do escritório.
- **Com foto:** selfie guardada para auditoria, sem comparação automática (F1).
- **Reconhecimento facial:** compara a selfie com a foto de cadastro e verifica
  se é uma pessoa real na frente da câmera, não uma foto de foto. Fora da
  tolerância, a marcação **é registrada mesmo assim** e marcada para revisão. A
  lei não permite impedir o registro (F2).
- **QR code:** QR fixo no local, impresso, ou QR dinâmico na tela do quiosque.
  Prova presença sem GPS (F2).
- **Cerca virtual:** um ou mais endereços com raio em metros. Fora da cerca, a
  empresa escolhe entre **bloquear** e **registrar com alerta**. O padrão é
  "registrar com alerta", que é o que a Portaria aceita sem discussão. Bloquear
  só para funcionário com local fixo e com aviso no termo (F1).

### 2.3 Regras invioláveis do registro

1. **A marcação original nunca é alterada nem apagada.** Correção é um
   tratamento separado (incluir marcação, desconsiderar marcação), com motivo,
   autor e data. O espelho mostra os dois.
2. **A hora vem do servidor**, sincronizado com a hora legal brasileira. Em
   marcação offline, guarda a hora do aparelho, o desvio em relação à última
   sincronização e o aviso "offline".
3. **Número sequencial (NSR)** por empresa, sem buracos, mais um hash
   encadeado (cada marcação guarda o hash da anterior) para provar que nada foi
   removido.
4. **Comprovante** a cada marcação: na tela, por e-mail ou no WhatsApp, e
   sempre disponível no histórico do colaborador.
5. **Nada de marcação automática** nem de horário pré-preenchido.

## 3. Configurações (Administrador) — F1

- **Empresa:** CNPJ ou CPF do empregador, razão social, unidades (cada uma com
  endereço, fuso e cerca), feriados nacionais carregados automaticamente e
  feriados estaduais e municipais por unidade.
- **Equipes e cargos.**
- **Jornadas:** modelos reaproveitáveis.
  - Fixa semanal, por exemplo seg–sex 8h–17h com 1h de intervalo e sábado
    8h–12h.
  - 12x36 (art. 59-A da CLT).
  - Flexível com carga diária ou semanal (sem horário de entrada).
  - Intervalo pré-assinalado ou registrado.
  - Por turno: diurno, noturno ou misto.
- **Regras de cálculo** (por jornada, com padrões da CLT já preenchidos):
  - tolerância de 5 minutos por marcação, até 10 por dia (art. 58, §1º);
  - hora extra: percentual de dias úteis, de domingos e de feriados, e limite
    diário;
  - **banco de horas ou pagamento**: por acordo individual (compensação em até
    6 meses), por acordo coletivo (até 12 meses) ou compensação no mesmo mês;
    a validade de cada crédito também é configurável;
  - adicional noturno: faixa (urbano 22h–5h), percentual (20%), hora reduzida
    de 52min30s e prorrogação depois das 5h;
  - interjornada mínima de 11h (art. 66) e intervalo intrajornada (art. 71),
    com alerta.
- **Colaboradores:** dados pessoais, matrícula, PIS ou CPF, admissão, unidade,
  equipe, cargo, jornada, gestor, foto de referência e canais liberados.
  Importação por planilha.
- **Notificações:** lembrete de bater ponto (X minutos depois do horário
  previsto sem marcação), por push, e-mail ou WhatsApp.

## 4. Painéis

### 4.1 Indicadores (F1)

Atualizados em tempo real, com filtro por unidade, equipe e período:

- quem está trabalhando agora, em intervalo, ausente ou atrasado;
- saldo do banco de horas (total, maiores positivos e maiores negativos);
- horas extras do mês em horas e em custo estimado;
- faltas, atrasos e saídas antecipadas;
- marcações para revisar (fora da cerca, rosto não confirmado, offline).

### 4.2 Alertas para gestores (F2)

Push, e-mail ou WhatsApp, com limite diário para não virar ruído:

- colaborador não registrou a entrada até X minutos depois do horário;
- intervalo menor que o mínimo;
- vai estourar o limite de hora extra hoje;
- interjornada menor que 11h;
- marcação fora da cerca.

### 4.3 Painel de risco de jornada (F4)

Pontuação por colaborador e por equipe a partir de sinais objetivos de jornada:

- hora extra habitual (acima de X horas em Y semanas);
- banco de horas perto de vencer sem compensação;
- intervalos suprimidos e interjornada violada repetidas vezes;
- trabalho em dias de folga e domingos seguidos;
- faltas e atrasos em alta;
- férias vencidas.

Serve como **um dos insumos** para o gerenciamento de riscos psicossociais da
NR-1 (GRO/PGR). **Não substitui** a avaliação de riscos feita pela empresa. A
palavra "preditivo" só entra no texto de venda quando houver modelo estatístico
validado. Até lá, o nome é "indicadores de risco", com regras transparentes.

## 5. Solicitações (F1)

O colaborador abre uma solicitação e o gestor aprova ou recusa. Cada solicitação
tem histórico e anexos.

| Tipo | Efeito ao aprovar |
| --- | --- |
| **Ajuste de marcação** (esqueci, marquei errado) | Cria um tratamento de inclusão ou desconsideração ligado à solicitação |
| **Abono** (consulta, reunião externa) | Abona as horas do período, com motivo configurável |
| **Atestado médico** | Foto ou PDF do atestado, CID opcional e de acesso restrito, abono dos dias |
| **Hora extra prévia** (opcional) | Registra a autorização. A hora extra sem autorização continua sendo registrada e calculada, mas fica marcada. |

## 6. Controle de ponto e fechamento (F1)

**Tela de controle:** grade colaborador × dia com as marcações, a jornada
prevista, os saldos e os destaques (falta, atraso, marcação ímpar). O
administrador ou o gestor ajusta ali mesmo, sempre como tratamento com motivo.

**Fechamento em passos:**

1. *Iniciar fechamento:* escolher o período e a unidade.
2. *Pendências:* lista do que impede fechar (marcações ímpares, solicitações em
   aberto, rostos não confirmados). Dá para resolver ou fechar "com
   pendências", deixando registrado.
3. *Conferência:* resumo por colaborador (horas normais, extras por
   percentual, noturnas, faltas, saldo do banco).
4. *Confirmar:* o período **trava**. A partir daí, qualquer ajuste reabre o
   período com motivo registrado.
5. *Espelho:* o sistema gera o espelho de ponto de cada colaborador e manda para
   assinatura no app, por e-mail ou pelo WhatsApp.
6. *Exportar:* AFD, AEJ, PDF dos espelhos e arquivo para a folha.

**Assinatura do espelho:** assinatura eletrônica avançada (Lei 14.063/2020),
com login, aceite, IP, data e hora, hash do PDF e geolocalização opcional. O
colaborador pode **assinar** ou **assinar com ressalva** (texto livre). A
ressalva vira alerta para o gestor.

## 7. Relatórios (F1 com 10 relatórios, F2 com 25 ou mais)

Todos saem em PDF e em planilha, com filtro por unidade, equipe, cargo e
período.

**F1:** espelho de ponto; horas extras; banco de horas (extrato e saldo); faltas
e atrasos; absenteísmo; ocorrências (fora da cerca, rosto não confirmado);
marcações ajustadas (auditoria); adicional noturno; solicitações; quem está
trabalhando agora.

**F2 em diante:** custo de hora extra por equipe, interjornada e intrajornada
violadas, presença por unidade, ranking de pontualidade (com cuidado na
exposição), feriados trabalhados, previsão do banco de horas a vencer e
relatórios de DP (admissões, férias, documentos pendentes).

## 8. Arquivos legais e integração com a folha

- **AFD** (Arquivo Fonte de Dados) e **AEJ** (Arquivo Eletrônico de Jornada)
  nos layouts dos anexos da Portaria MTP 671/2021 (F1 para exportar; F2 com o
  validador oficial).
- **Comprovante de registro** com assinatura eletrônica do sistema (F2).
- **Exportação para a folha:** arquivo de eventos (código do evento ×
  quantidade) configurável, com modelos prontos para os sistemas de folha mais
  usados pelos contadores parceiros. Começar pelos dois sistemas que os
  primeiros escritórios usam (F2).
- **API** de leitura com chave (F3).

## 9. Ponto + DP (F3)

- **Admissão digital:** link para o candidato preencher os próprios dados, com
  checklist de documentos por foto, conferência pelo RH, contrato gerado a
  partir de um modelo e assinado no celular. No fim, o colaborador já está
  cadastrado no ponto.
- **Documentos em massa:** envio de holerites, informes e comunicados para todos
  ou para um filtro, com coleta de assinatura, painel de quem assinou e lembrete
  automático. Os holerites podem ser divididos a partir de um PDF único.
- **GED:** pasta por colaborador com categorias, validade (ASO, certificados de
  NR) e alerta de vencimento. Armazenamento no R2 (`@dilon-zap/storage`).
- **Férias e folgas:** períodos aquisitivos e concessivos, alerta de férias
  vencendo, solicitação e aprovação, simulação de valores (férias + 1/3, abono
  pecuniário de até 1/3, art. 143) e provisão de 13º. **É uma simulação para
  apoio. O cálculo oficial continua na folha.**

## 10. RH Completo (F4)

- **Escalas:** montar a escala do mês por arrastar e soltar (6x1, 12x36,
  revezamento), validar as regras (folga semanal, domingo a cada X semanas,
  interjornada), publicar no app do colaborador e permitir troca de turno entre
  colegas com aprovação.
- **Painel de risco** (seção 4.3).

### Sobre a "consulta cadastral por nome e CPF"

**Não recomendamos construir.** Consultar antecedentes ou restrições de crédito
de candidatos, sem justificativa ligada ao cargo, é tratado pela Justiça do
Trabalho como discriminatório e gera dano moral. Também é difícil de justificar
na LGPD. Se um cliente insistir, a opção é uma integração restrita a casos
previstos em lei (por exemplo, vigilante), com aviso explícito, nunca uma
função genérica.

## 11. Requisitos não funcionais

- **Disponibilidade:** o registro de ponto precisa de 99,9% no horário
  comercial. O PWA guarda a marcação offline, então uma queda curta do servidor
  não impede o registro.
- **Desempenho:** a marcação é confirmada em menos de 2 s em 4G. O fechamento
  de 300 colaboradores leva menos de 30 s.
- **Retenção:** marcações, tratamentos e espelhos são guardados por pelo menos 5
  anos. Selfies ficam pelo prazo definido no RIPD, com sugestão de 12 meses.
- **LGPD:** a biometria é armazenada como vetor no provedor, ou a foto é
  criptografada no bucket. Há consentimento ou base legal registrada, exportação
  dos dados do titular e exclusão no desligamento, respeitando a retenção
  legal.
- **Auditoria:** toda ação de administrador ou gestor fica em log
  (quem, o quê, antes e depois).
- **Acessibilidade e celular simples:** o PWA funciona em Android com 2 GB de
  RAM e tela pequena, com botões grandes e alto contraste.
