# Briefing da landing page — produto de esquadrias

Para gerar em **Lovable**. Cole este documento inteiro no prompt.

O produto já existe e está no ar: **https://esquadrias.dilontech.com.br**. Esta
página é para vendê-lo, seguindo a mesma linha das outras verticais da Dilon
Tech (`dilontech.com.br/#verticais` e `dilontech.com.br/zap`).

---

## Identidade

**Siga o estilo visual de `dilontech.com.br/zap`** — mesma tipografia, mesmo
espaçamento, mesma pegada dos botões e cards. Esta é a segunda vertical do
mesmo portfólio, e as duas páginas precisam parecer irmãs, não concorrentes.

Uma diferença deliberada: o **acento é azul** (`#1D74CA`), que é a cor do
próprio produto. O Zap usa verde. É o que distingue as verticais sem quebrar a
família.

Tom de voz: **direto, de quem conhece a oficina**. Nada de "solução inovadora"
ou "revolucione seu negócio". A pessoa que lê já sabe o que é transpasse e
quanto custa o quilo do alumínio — falar difícil com ela soa a quem nunca
entrou numa serralheria.

---

## Estrutura da página

### 1. Herói

**Título:** Do vão medido ao plano de corte.

**Subtítulo:** Sistema de orçamento, produção e financeiro para vidraçarias e
serralherias de alumínio. Você informa a medida do vão — ele devolve os cortes,
o material e o preço.

**Botão principal:** Testar grátis
**Botão secundário:** Ver como funciona (rola até a seção 3)

**Visual:** captura da tela de orçamento com a janela de "adicionar item"
aberta, mostrando custo, lucro e total. É a tela que mais vende.

### 2. O problema (fundo escuro, contraste com o herói)

**Título:** Hoje esse cálculo mora em três lugares que não conversam

Três blocos com ícone, lado a lado:

| | |
|---|---|
| **Caderno ou WhatsApp** | A medida do vão chega solta, sem padrão. |
| **Planilha ou calculadora** | O corte é calculado na mão, tipologia por tipologia. |
| **Memória do encarregado** | Quanto sobra de barra, quanto entra de perda, qual margem aplicar. |

**Fecho da seção:** O custo disso não aparece em lugar nenhum: barra comprada a
mais, margem que some no desconto do balcão, obra aprovada que ninguém lançou
no financeiro.

### 3. O diferencial — a seção mais importante da página

**Título:** A tipologia é sua, não nossa

**Texto:** Os concorrentes vendem um catálogo fechado com milhares de
tipologias prontas. Funciona até você comprar outra linha de perfil, usar outra
folga de montagem ou negociar outro preço do quilo — e aí volta tudo para a
planilha.

Aqui você escreve a regra da sua montagem, e o sistema calcula com os seus
números.

**Mostrar num bloco de código, com destaque:**

```
Trilho superior e inferior   qtd: 2     comprimento: L
Folha — vertical             qtd: 4     comprimento: H - 60
Folha — horizontal           qtd: 4     comprimento: (L + transpasse) / 2 - 30
Vidro da folha               qtd: 2     largura: (L + transpasse) / 2 - 100 - folgaVidro
Dobradiças                   qtd: se(H > 2100, 4, 3)
```

**Abaixo:** Informe 1200 × 1000 e ele devolve os cortes, os vidros, as
ferragens e o preço. Mude a folga e o corte muda junto.

### 4. Recursos — grade de 6 cards

Cada card: ícone, título curto, uma frase.

1. **Orçamento com o custo aberto** — Alumínio por peso, vidro por m², ferragem por peça. A margem efetiva fica ao lado do desconto e mostra na hora o que "dar 10%" fez com o lucro.
2. **Plano de corte otimizado** — Encaixa as peças nas barras de 6 metros e desconta a espessura do disco a cada corte. Separa retalho reaproveitável de refugo.
3. **Relação de materiais** — A lista de compra pronta: alumínio em barras, vidro em m², ferragem em peça. Agrega o consumo de todos os itens.
4. **Proposta com a sua marca** — O cliente final recebe um documento com o logotipo da sua empresa. Nenhum custo ou margem aparece nele.
5. **Obras e financeiro ligados** — Aprovar o orçamento cria a obra e gera as parcelas. Sem redigitar, sem esquecer de lançar.
6. **Cada função vê o que precisa** — O cortador vê medida e perfil. O preço de venda ele não vê.

### 5. Como funciona — 4 passos numerados, com captura de tela em cada

1. **Cadastre seus insumos** — Perfis com peso por metro e preço do quilo, vidros por m², ferragens por peça, e as cores com o fator de cada acabamento.
2. **Monte suas tipologias** — Ou duplique uma das que já vêm prontas e ajuste para a sua linha de perfil.
3. **Orce em segundos** — Escolha a tipologia, informe o vão, veja custo e preço na hora.
4. **Produza e receba** — Plano de corte para a bancada, obra em etapas, parcelas no financeiro.

### 6. Planos

Três colunas, com a do meio destacada como "mais escolhido".

| | **Básico** | **Essencial** | **Avançado** |
|---|---|---|---|
| | R$ 89,90/mês | R$ 149,90/mês | R$ 239,90/mês |
| Orçamento com tipologia paramétrica | ✓ | ✓ | ✓ |
| Relação de materiais | ✓ | ✓ | ✓ |
| Clientes, obras e proposta | ✓ | ✓ | ✓ |
| Usuários | 3 | ilimitados | ilimitados |
| Financeiro, agenda, relatórios, metas | | ✓ | ✓ |
| Plano de corte otimizado | | | ✓ |
| Etiquetas, checklist, ordem de serviço | | | em breve |
| API para integração | | | em breve |

**Frase abaixo da tabela:** A tipologia paramétrica e a relação de materiais
entram desde o plano mais barato. Sem elas o orçamento vira digitação manual —
e cobrar por isso seria cobrar pelo que a planilha já faz de graça.

> **Marcar "em breve" é obrigatório.** Esses quatro recursos ainda não têm tela.
> Anunciá-los como prontos gera cancelamento na primeira semana.

### 7. Perguntas frequentes

- **Preciso cadastrar tudo antes de fazer o primeiro orçamento?** Não. O sistema já vem com um catálogo da linha 25 e seis tipologias montadas. Você duplica e ajusta para os seus preços.
- **Serve para a minha linha de perfil?** Serve para qualquer uma. Você cadastra os perfis que compra, com o peso por metro e o preço do quilo do seu fornecedor.
- **O plano de corte considera a perda da serra?** Considera. A espessura do disco é configurável e entra em cada corte — é o que faz o plano bater com a bancada.
- **Meus orçamentos antigos mudam de preço quando o alumínio sobe?** Não. Cada orçamento guarda a memória do cálculo de quando foi feito. Orçamento aprovado é documento, não consulta.
- **Meus dados ficam separados dos de outras empresas?** Ficam. Cada empresa tem seu próprio espaço, e nenhuma consulta cruza essa linha.

### 8. Chamada final

**Título:** Teste com uma obra sua

**Texto:** Pegue um orçamento que você já fez na planilha e refaça no sistema.
Compare o preço, o material e o número de barras.

**Botão:** Começar agora

---

## Requisitos técnicos

- Responsiva, com atenção real ao celular: boa parte deste público abre link no telefone, no meio da obra
- Botões levam para `https://esquadrias.dilontech.com.br`
- Formulário de contato (nome, empresa, telefone, e-mail) → mesmo destino usado na página do Zap
- Título da aba: "Esquadrias — Dilon Tech" · descrição: "Sistema de orçamento, produção e financeiro para vidraçarias e serralherias de alumínio."
- Cores: fundo claro `#F4F6F9`, texto `#1F2A30`, acento `#1D74CA`, seções escuras `#1F2A30`
- Sem carrossel de depoimentos: o produto é novo e não temos depoimento real. Inventar um é o tipo de coisa que o primeiro cliente descobre.

## Capturas de tela

As imagens do produto estão em anexo (as mesmas da apresentação comercial).
Se precisar de outra tela, é só pedir — o sistema está no ar e dá para capturar
qualquer uma.
