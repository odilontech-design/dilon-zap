# Plano comercial — Dilon Ponto

## 1. O problema que o cliente paga para resolver

Pela CLT (art. 74, §2º), todo estabelecimento com **mais de 20 empregados** é
obrigado a registrar a entrada e a saída de cada um. Empresas menores registram
mesmo assim, porque é a principal prova em ação trabalhista.

Na prática, a pequena empresa faz isso de três jeitos ruins:

| Como faz hoje | O que dá errado |
| --- | --- |
| Folha de ponto em papel ou planilha | Horários "britânicos" (8:00 em ponto todo dia) que o juiz desconsidera. O fechamento leva dias. Ninguém sabe o saldo do banco de horas. |
| Relógio de ponto físico (REP-C) | Custa de R$ 2 a 4 mil por unidade, mais bobina e manutenção. Não serve para equipe externa. O espelho continua sendo montado à mão. |
| Aplicativo genérico barato | Não gera AFD/AEJ, não calcula adicional noturno nem interjornada, e não segura uma fiscalização. |

**A dor que mais vende não é a fiscalização. É o fechamento do mês:** o dono ou
o DP gastando de 2 a 5 dias conferindo marcação, calculando hora extra e
mandando para o contador. E logo depois vem o **passivo trabalhista**, porque
hora extra mal controlada é o pedido mais comum na Justiça do Trabalho.

## 2. Cliente ideal (ICP)

**Núcleo (onde começar):**

- 10 a 150 funcionários, uma a cinco unidades.
- Setores: varejo e lojas, clínicas e laboratórios, restaurantes e food service,
  indústria leve, construção e serviços com equipe externa (manutenção,
  limpeza, instalação).
- Quem decide é o dono ou o gerente administrativo. Quem usa todo dia é o DP
  interno ou o escritório contábil.
- Sinal de compra: está com fiscalização marcada, perdeu uma ação trabalhista,
  abriu filial ou passou de 20 funcionários.

**Segunda onda:**

- Escritórios contábeis que fazem a folha de dezenas de clientes. São canal de
  venda, não só cliente (ver seção 6).
- Empresas de 150 a 500 funcionários com escala rotativa (12x36, 6x1). Pagam
  mais, mas pedem o módulo de escalas e integração com o sistema de folha.

**Fora do foco no começo:** grandes empresas, que fazem RFP, exigem SSO e SLA
contratual e levam de 6 a 12 meses para fechar.

## 3. Concorrência

O mercado é maduro e disputado. Isso é bom: o cliente já sabe o que é ponto
digital e já tem expectativa de preço.

| Grupo | Exemplos | Como competimos |
| --- | --- | --- |
| Grandes plataformas de RH e benefícios | VR (Pontomais), Sólides, Factorial | Vendem pacote amplo com equipe comercial grande. Ganhamos com preço de pequena empresa, implantação em uma tarde, ponto pelo WhatsApp e atendimento direto. |
| Especialistas em ponto | Tangerino, Oitchau, Ahgora, Secullum | Produtos sólidos e preço parecido. Ganhamos com o canal contador e por já estarmos dentro do WhatsApp e do ERP do cliente. |
| Relógio físico com software | Henry, Control iD, Dimep | Venda de hardware. Ganhamos dispensando o equipamento. O tablet da recepção já serve. |
| Planilha e papel | — | É o maior concorrente em número de empresas. Ganhamos com a conta do tempo de fechamento e do risco. |

> **Antes de fechar preço:** levante as tabelas atuais de 4 ou 5 concorrentes
> (site, simulador ou ligação de "cliente oculto"). Os preços de mercado mudam
> com frequência e não devem ser copiados de memória.

## 4. Posicionamento

**Frase de posicionamento:**

> Para pequenas e médias empresas que ainda fecham o ponto na mão, o Dilon Ponto
> registra a jornada pelo celular ou pelo WhatsApp e entrega o mês fechado,
> assinado e pronto para o contador.

**Três diferenciais (nesta ordem):**

1. **Ponto pelo WhatsApp.** Muita gente não instala aplicativo, ou o celular não
   tem espaço, e a empresa não quer comprar aparelho para ninguém. Pelo
   WhatsApp, o funcionário manda "entrada", a selfie e a localização, e recebe
   o comprovante na mesma conversa. A Dilon já opera WhatsApp em produção
   (Dilon Zap). Nenhum concorrente pequeno tem essa experiência.
2. **Fechamento que chega pronto no contador.** Exportação no layout dos
   sistemas de folha mais usados e acesso do escritório contábil ao painel. Isso
   conecta direto com o ERP Dilon Contabilidade.
3. **Feito para quem não tem DP.** Configuração guiada de jornada, regras da CLT
   já ligadas por padrão e alertas em linguagem simples ("o João está sem
   intervalo há 3 dias").

**O que não prometemos:** "conformidade garantida" nem "zero passivo". Ponto
digital reduz o risco, mas não o elimina, e prometer isso cria problema no
contrato.

## 5. Planos e preços

Cobrança **por funcionário ativo por mês**, com mínimo mensal. Não há
fidelidade: o desconto vem do plano anual, não de multa. A cobrança usa o
pacote `@dilon-zap/receivables` e os gateways que o Zap já usa (Mercado Pago e
Asaas).

### Estratégia de preço: não competir por preço

A decisão é **não ser o mais barato**. Os primeiros clientes vão exigir mais
trabalho de implantação, treinamento e ajuste, e a tabela precisa pagar isso.

- **A tabela é o teto, não o preço de briga.** Os valores abaixo deixam
  margem para negociar sem chegar perto do custo.
- **A venda principal é a combinada.** Ponto junto com outra solução da Dilon:
  Zap + Ponto para quem atende pelo WhatsApp, ou ERP Contabilidade + Ponto no
  canal contador. O desconto aparece no pacote, não no produto avulso, e o
  cliente com duas soluções cancela menos.
- **Limite de desconto:** até 15% no avulso e até 25% no pacote combinado,
  sempre condicionado a algo em troca (plano anual, depoimento, indicação ou
  caso de sucesso). Acima disso, só com aprovação.
- **Argumento de venda é valor, não preço:** horas de fechamento economizadas
  e o risco trabalhista reduzido.

### 5.1 Plano Essencial — porta de entrada (1 a 10 colaboradores)

**R$ 59,90 por mês, preço fechado** para empresas de 1 a 10 colaboradores. É o
plano que tira a microempresa do papel. Também é o primeiro plano que dá para
vender, porque tudo nele cabe no MVP (Fase 1).

| Inclui | Detalhe |
| --- | --- |
| 📲 Registro de ponto | App no celular do colaborador ou web no computador, com geolocalização |
| Modos de registro | Registro simples e registro simples com foto (sem reconhecimento facial) |
| 📊 Contabilização automática | Horas trabalhadas, horas faltantes, atrasos, faltas, hora extra, banco de horas, adicional noturno etc. |
| Espelho de ponto | Disponível para o colaborador e para a empresa |
| Ajustes | Ajustes manuais no ponto, sempre como tratamento com motivo (a marcação original é preservada) |
| Relatórios | Emissão de relatórios completos |
| Limites | Até **10 colaboradores**, até **2 turnos** (modelos de jornada) e **1 CNPJ** |
| Implantação | Treinamento online e ao vivo incluso, acesso liberado logo após a contratação e passo a passo para incluir os colaboradores |
| 📞 Suporte | 100% humanizado, por telefone e chat, sem custo e sem limite de atendimentos |
| 💳 Pagamento | Boleto bancário no ato da contratação |

**Fica de fora do Essencial** (motivo para subir de plano): reconhecimento
facial, cerca virtual, quiosque coletivo, ponto pelo WhatsApp, solicitações com
aprovação do gestor, fechamento com assinatura digital do espelho, alertas,
exportação para a folha, mais de 2 turnos e mais de 1 CNPJ.

**Cuidados para o Essencial dar lucro e não dar dor de cabeça:**

- **Custo direto baixo:** sem biometria e sem WhatsApp, o custo fica em torno de
  R$ 0,30 por colaborador de infraestrutura mais o suporte. Com 10
  colaboradores, a margem bruta fica perto de 75%, **desde que o suporte não
  exploda**.
- **"Suporte sem limite" é o maior risco de custo.** R$ 59,90 paga cerca de 30
  minutos de atendimento por mês. Para isso fechar a conta, a configuração
  guiada, a base de ajuda e o passo a passo precisam resolver a maioria das
  dúvidas antes de alguém ligar. Acompanhe os minutos de suporte por cliente
  desde o primeiro mês.
- **Treinamento ao vivo em turma:** faça sessões coletivas em horário fixo (por
  exemplo, terça e quinta às 10h), não uma sessão por cliente. Uma por cliente
  só a partir do plano Ponto.
- **Boleto × liberação imediata:** o boleto leva de 1 a 3 dias úteis para
  compensar. Para cumprir o "acesso liberado logo após a contratação", libere o
  acesso **na emissão do boleto**, com bloqueio automático se não for pago em 5
  dias. Ofereça também Pix, que compensa na hora e evita o problema.
- **O 11º colaborador:** ao cadastrar o 11º, o sistema oferece a troca para o
  plano Ponto. O mínimo do Ponto foi baixado para R$ 99 (11 × R$ 9) para o
  salto não ser de R$ 59,90 para R$ 149 de uma vez.

### 5.2 Planos por colaborador (acima de 10)

| | **Ponto** | **Ponto + DP** | **RH Completo** |
| --- | --- | --- | --- |
| Preço por funcionário/mês | R$ 9 | R$ 14 | R$ 19 |
| Mínimo mensal | R$ 99 | R$ 249 | R$ 399 |
| Registro (app, web, quiosque, WhatsApp) | ✓ | ✓ | ✓ |
| Reconhecimento facial e cerca virtual | ✓ | ✓ | ✓ |
| Banco de horas, hora extra, adicional noturno | ✓ | ✓ | ✓ |
| Solicitações (ajuste, abono, atestado) | ✓ | ✓ | ✓ |
| Fechamento + espelho com assinatura digital | ✓ | ✓ | ✓ |
| Indicadores e relatórios | ✓ | ✓ | ✓ |
| Alertas para gestores e lembretes de ponto | ✓ | ✓ | ✓ |
| Exportação para folha (AFD, AEJ, layouts) | ✓ | ✓ | ✓ |
| Admissão digital | — | ✓ | ✓ |
| Envio de documentos em massa com assinatura | — | ✓ | ✓ |
| Arquivo digital de documentos (GED) | — | ✓ | ✓ |
| Férias e folgas | — | ✓ | ✓ |
| Escalas rotativas | — | — | ✓ |
| Painel de risco de jornada | — | — | ✓ |
| Acesso do escritório contábil | ✓ | ✓ | ✓ |

**Regras de cobrança:**

- **Implantação:** grátis até 50 funcionários. Acima disso, R$ 990 com
  importação da base e treinamento ao vivo.
- **Anual:** 2 meses de desconto (paga 10).
- **Teste:** 14 dias grátis, sem cartão, com até 10 funcionários. No fim do
  teste, quem tem até 10 colaboradores cai direto no Essencial.
- **Funcionário ativo** = teve pelo menos uma marcação ou estava com contrato
  ativo no mês. Desligado no meio do mês conta como ativo naquele mês.

**Conta de referência (hipótese de custo por funcionário/mês):**

| Item | Estimativa |
| --- | --- |
| Infraestrutura (Postgres, app, armazenamento de selfies) | R$ 0,30 |
| Reconhecimento facial (cerca de 90 comparações/mês) | R$ 0,50 |
| WhatsApp, só para quem usa o canal | R$ 0,20 a 0,80 |
| Suporte (diluído) | R$ 1,00 |
| **Custo direto** | **≈ R$ 2 a 2,60** |

No plano Ponto, a margem bruta fica acima de 70%. **Confirme os preços reais do
provedor de reconhecimento facial e da API oficial do WhatsApp antes de
publicar a tabela.** Os dois cobram em dólar.

## 6. Canais de venda

**Canal 1: escritórios contábeis (prioridade).**

- O ERP Dilon Contabilidade já tem escritórios ativos. Cada escritório atende de
  20 a 200 empresas, e muitas delas fazem a folha com ele.
- O que o contador ganha: recebe o ponto fechado em vez de planilha, gasta menos
  tempo na folha e leva **20% de comissão recorrente** enquanto o cliente pagar.
  Outra opção é revender com desconto e cobrar o próprio preço.
- O que entregamos a ele: um painel com todos os clientes dele que usam o ponto,
  um link de indicação com rastreio e um material pronto para mandar no
  WhatsApp.
- Meta: 10 escritórios parceiros no primeiro semestre, 3 clientes ativos por
  escritório.

**Canal 2: base do Dilon Zap.** As empresas que já usam o Zap confiam na Dilon e
já têm o WhatsApp conectado. Oferta: 3 meses com 50% de desconto no plano Ponto.

**Canal 3: busca e conteúdo.** Termos de alta intenção: "ponto eletrônico
obrigatório", "como calcular banco de horas", "Portaria 671", "controle de
ponto pelo celular". Inclui calculadoras gratuitas (hora extra, adicional
noturno, banco de horas) que levam ao teste grátis.

**Canal 4: venda direta assistida.** Demonstração de 20 minutos por vídeo,
agendada pelo próprio Zap. O SDR que já existe no monorepo
(`packages/sdr-core`) pode qualificar os contatos.

## 7. Funil e metas (primeiro ano)

Hipótese conservadora, com ticket médio de 25 funcionários × R$ 11 ≈ **R$ 275
por mês**:

| Marco | Clientes pagantes | Receita recorrente mensal |
| --- | --- | --- |
| Fim do mês 3 (pilotos) | 3 | ~R$ 600 (preço de piloto) |
| Mês 6 | 25 | ~R$ 6.900 |
| Mês 9 | 60 | ~R$ 16.500 |
| Mês 12 | 120 | ~R$ 33.000 |

Taxas a acompanhar desde o primeiro dia:

- teste → pagante (meta ≥ 25%)
- cancelamento mensal (meta ≤ 3%)
- tempo até o primeiro fechamento (meta ≤ 35 dias desde o cadastro)
- percentual de funcionários que batem ponto pelo menos 20 dias no mês, que é o
  sinal de que o produto pegou

## 8. Validação antes de construir

Nada desta tabela de preço está provado. Antes de escrever a primeira linha do
produto:

1. **Landing com lista de espera** (ver
   [`landing-page-brief.md`](./landing-page-brief.md)), com o botão "Quero ser
   piloto".
2. **15 conversas** de 20 minutos: 8 donos ou responsáveis de DP de empresas no
   ICP e 7 contadores. Perguntas-chave:
   - Como você fecha o ponto hoje e quanto tempo leva?
   - Já teve ação trabalhista ou fiscalização por causa de jornada?
   - Quanto paga hoje (relógio, sistema, horas do contador)?
   - Seus funcionários bateriam ponto pelo WhatsApp?
   - (Contador) Quantos clientes seus têm problema com ponto? Indicaria um
     sistema por 20% recorrente?
3. **3 pilotos pré-pagos:** preço de piloto (50% por 6 meses), pago antes do MVP
   ficar pronto. Se ninguém pagar adiantado, o problema está na oferta, não no
   código.

**Critério para seguir:** pelo menos 3 pilotos pagos e 3 escritórios contábeis
dispostos a indicar. Sem isso, refaça o posicionamento antes de construir.

## 9. Riscos comerciais

| Risco | Mitigação |
| --- | --- |
| Concorrente grande baixa o preço | Não competir só por preço. Apostar no canal contador e no WhatsApp, que são difíceis de copiar rápido. |
| WhatsApp não oficial bloquear o número | O ponto pelo WhatsApp usa **somente a API oficial (Cloud API)**, nunca o Baileys. Ponto parado é falha grave para o cliente. |
| Falha de cálculo virar processo contra nós | Motor com testes por regra da CLT, revisão jurídica, contrato que limite a responsabilidade e espelho sempre conferido e assinado pelo funcionário. |
| Fiscalização questionar o enquadramento | Concluir o processo de REP-P (registro no INPI e atestado técnico) antes de vender como "ponto oficial". Até lá, vender como "controle de jornada" aos pilotos. |
| Suporte consumir o time | Configuração guiada, base de ajuda desde o MVP e suporte pelo próprio Zap. |
