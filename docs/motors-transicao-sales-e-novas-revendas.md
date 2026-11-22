# Dilon Motors: transição oficial do Sales e novas revendas

> Estado: **plano de execução**, para o fundador. Nome comercial adotado: **Dilon Motors** (o produto no sistema continua como "Revenda de veículos"; o site passa a usar o nome Motors e a URL `/veiculos` vira `/motors` com redirecionamento permanente quando a página nova for ao ar).
> Baseado em `docs/revenda-veiculos.md`, `docs/portais-e-site.md` e `docs/vendedor-ia.md`. **Ajuste o que estiver diferente da realidade: não tenho acesso ao banco de produção nem ao contrato atual do Sales.**

## Parte A. Transição oficial do Sales (revenda de 60 carros)

### A.1 O que significa "oficial"
Hoje o Sales usa o Dilon Motors mas ainda tem sistemas antigos ativos (AutoCerto no site, Mobigestor/MobiAuto, WebMotors e Meu Carro Novo). **Oficial** = o Dilon passa a ser o único sistema da loja, com plano, cobrança e acordo por escrito, e o sistema antigo é desligado **sem perder anúncio nem lead**.

### A.2 Antes de virar a chave: lista de verificação (go / no-go)
Só desligue o sistema antigo quando **todos** estiverem marcados:

- [ ] **Estoque:** os 60 carros conferidos (placa, km, preço, fotos). Sem km informada o Zap não publica o anúncio.
- [ ] **Portais cobertos pelo Zap:** OLX, Webmotors, MobiAuto e NaPista. Os conectores da MobiAuto e do NaPista ainda **não rodaram contra o sistema de verdade** (falta liberação de acesso); a AutoCerto continua publicando neles enquanto isso. **Regra do projeto: só desligar a AutoCerto quando os três portais estiverem cobertos.** Se algum não estiver, a data da virada espera.
- [ ] **Leads:** onde cada portal entrega o lead e como chega ao CRM do Zap, testado com um lead real de cada um.
- [ ] **Site da loja:** domínio apontado (CNAME) para o Zap, HTTPS emitido e páginas de carro abrindo. Endereços antigos redirecionados (o `siteOrigemId` guarda o id para isso).
- [ ] **WhatsApp:** número da loja conectado, vendedores com login e a conversa chegando no Inbox.
- [ ] **Vendedor IA:** decidir se liga já. Ainda é a primeira versão, sem muitas conversas reais: ligar **em modo sugerir** (uma pessoa aprova a resposta) por 7 dias antes de ir ao automático.
- [ ] **Reversão:** saber exatamente como religar a AutoCerto se algo falhar nos primeiros dias.

### A.3 Dia da virada (em horário calmo)
1. "Anunciar todos" no Zap, que adota os anúncios existentes.
2. **No mesmo dia**, remover a credencial da AutoCerto no Cockpit, para os dois sistemas não disputarem o anúncio.
3. Desativar no Mobigestor (aba Integrações > Estoque) a Webmotors e o Meu Carro Novo, que também empurram estoque.
4. Conferir um carro em cada portal (preço, fotos, status) e um lead de teste.
5. Acompanhar o painel por 2 horas.

### A.4 Acordo comercial (esta semana)
- **Plano:** com 60 carros, o plano **Revenda** (até 70 carros, R$ 597 por mês) cabe. Vendedor IA é complemento à parte (referência da documentação: até 300 leads por mês, R$ 497); **confirmar o valor que você quer praticar**.
- **Formalização:** mensagem ou e-mail com plano, valor, data de início da cobrança, cobrança por boleto, sem fidelidade, e o "de acordo" do dono. Guarde o registro.
- **Sistema:** plano e forma de cobrança configurados no painel de administração (ação sua).
- **Cobrança:** definir se começa na virada ou após 30 dias de acompanhamento, e dizer isso no acordo.

### A.5 Primeiros 30 dias
| Quando | O quê |
| --- | --- |
| Dias 1 a 7 | Contato diário rápido (5 minutos). Resolver o que aparecer no mesmo dia |
| Semanas 2 a 4 | Reunião de 15 minutos por semana com o dono e o gerente |
| Dia 30 | Balanço com números |

**Números a acompanhar (mesmo painel que vai virar prova):** leads recebidos, tempo da primeira resposta, conversas atendidas fora do horário, carros vendidos e **margem real registrada**, e, se o Vendedor IA estiver ligado, o **custo por lead** que o painel mostra.

### A.6 Depoimento (dias 21 a 30)
- Pedir quando houver **um resultado concreto** (ex.: "respondemos 100% dos leads da noite").
- **Autorização por escrito**, simples: "Autorizo a Dilon Tech a usar meu nome, o nome da loja, minha foto e a frase abaixo no site e nas redes. Posso pedir a retirada a qualquer momento." Guardar o registro **fora do site**.
- Três perguntas: (1) Como era antes? (2) O que mudou na rotina? (3) Para quem você recomendaria?
- Opcional: vídeo de 30 segundos no celular, na loja.
- **Só publicar** o que tiver autorização e dado verdadeiro. Número sem fonte não entra.

### A.7 Riscos
- Conector de portal sem teste real em produção: validar com um carro por vez antes de "Anunciar todos".
- Perder lead na troca: acompanhar os portais por 48 horas.
- **Não forçar a data:** é melhor adiar a virada do que desligar a AutoCerto com um portal descoberto.

## Parte B. Nova revenda como cliente (iniciar ainda esta semana)

**Meta realista da semana:** conseguir **1 revenda em avaliação assistida de 7 dias**. Fechar pagante na mesma semana é possível só se o dono já estiver aquecido; o objetivo é **iniciar a avaliação**.

### B.1 Perfil
Revenda com **20 a 150 carros**, que anuncia na OLX ou Webmotors, com **2 ou mais vendedores**, onde o dono decide.

### B.2 Funil da semana (meta, para ajustar)
| Etapa | Meta da semana |
| --- | --- |
| Revendas listadas e qualificadas | 30 |
| Contatos feitos (ligação, visita, mensagem personalizada) | 30 |
| Conversas | 8 |
| Demonstrações de 20 minutos | 3 a 4 |
| Avaliações assistidas iniciadas | 1 |

### B.3 Dia a dia (segunda 23 a sexta 27/11)
| Dia | Foco |
| --- | --- |
| Segunda | Montar a lista de 30 revendas (anúncios da OLX e Webmotors, Instagram, Google Maps), perto de você. Anotar: tamanho do pátio, quantos anúncios, nome do dono |
| Terça | Os **15 primeiros contatos**: ligar ou visitar quem for próximo; mensagem personalizada para os demais |
| Quarta | Mais **15 contatos**. Marcar as demonstrações pela agenda |
| Quinta | **Demonstrações** (2 a 3) |
| Sexta | Demonstração + proposta + **iniciar a avaliação** com a melhor. Pedir ao **Sales** a indicação de 2 colegas lojistas |

### B.4 Abordagem (o que funciona e o que evitar)
- **Prefira ligar, visitar ou mandar mensagem personalizada** a poucos. **Não faça disparo em massa** pelo WhatsApp: o número comercial da Dilon pode ser bloqueado, e é lista fria sem pedido de contato.
- Máximo de **15 a 20 contatos por dia**, cada um com algo específico da loja (um carro que está anunciado, o tempo de resposta).
- **O gancho:** em horário comercial e fora dele, mande uma pergunta real sobre um carro anunciado e **anote quanto tempo levou a resposta**. Diga isso de forma honesta ao contar: "mandei uma pergunta sobre o [carro] às 20h, e a resposta chegou às [hora]".
- Quem pedir para parar, **pare** e registre.

**Mensagem 1 (WhatsApp, personalizada):**
> Olá, [nome]! Sou o Felipe, da Dilon Tech. Vi o [carro] da [loja] anunciado na OLX. Perguntei sobre ele às [hora] e a resposta chegou às [hora]. Desenvolvi um sistema que coloca a equipe da loja no mesmo WhatsApp, responde o lead do portal a qualquer hora e mostra a margem real de cada carro. Posso mostrar em 15 minutos com o estoque da [loja]?

**Mensagem 2 (3 dias depois, se não responder):**
> [Nome], só confirmando se faz sentido uma conversa rápida. Importo o estoque da loja de graça para você ver como fica. Se não for o momento, sem problema.

**Ligação (30 segundos):** apresentação, o tempo de resposta que você mediu, a oferta de 15 minutos com o estoque dele.

### B.5 Demonstração (20 minutos, nesta ordem)
1. **3 perguntas:** quantos carros no pátio? quem responde os leads à noite? como controla o custo e a margem de cada carro?
2. Mostrar **o estoque dele já importado** (importação pela planilha ou pelo site, antes da demonstração).
3. Mostrar a **ficha com custo e margem**, a vitrine da loja e um lead virando conversa.
4. Mostrar o **Vendedor IA** respondendo (se já estiver liberado).
5. **Um plano recomendado** (Garagem até 30 carros, Revenda até 70, Revenda+ até 150), não os três.
6. **Próximo passo:** avaliação assistida de 7 dias, sem cartão, com a implantação feita junto.

### B.6 Avaliação assistida (7 dias)
- **Dia 0:** estoque importado, WhatsApp conectado, vendedores com login. 30 minutos com a equipe.
- **Dia 3:** ligar. Se a equipe não estiver usando, resolver o motivo.
- **Dia 7:** balanço com números e proposta. Cobrança por boleto só se ele continuar.
- **Ativado** = a equipe usou o Inbox e atualizou o estoque nos 7 dias.

### B.7 Indicação (a forma mais rápida de achar a segunda revenda)
Peça ao **Sales** o contato de **2 lojistas conhecidos**. Apresentação por quem já usa converte mais do que contato frio. **Decida se haverá benefício** (ex.: um mês de desconto quando a indicada fechar).

### B.8 Registro e medição
Use o **funil do próprio Dilon Zap** com as etapas: Lista, Contatado, Conversa, Demonstração, Avaliação, Cliente. Se preferir, comece por uma planilha. Registre a origem de cada contato.

### B.9 Decisões suas
1. Valor do Vendedor IA para o Sales e para as novas lojas (hoje: sob consulta no site).
2. Se haverá benefício de indicação.
3. Data da virada do Sales e se a cobrança começa nela.
4. Quem faz a conexão com a MobiAuto e a liberação de acesso do NaPista (itens ainda dependentes de terceiros).
