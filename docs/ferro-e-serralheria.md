# Ferro e serralheria no mesmo sistema

> Resposta à pergunta da Larissa: "a gente consegue alimentar esse sistema com
> ferro, em vez de alumínio? Hoje tudo é calculado na mão, e ferro tem uma
> variedade imensa de perfis e de vãos."

Consegue — e não é adaptação, é o mesmo motor. Este documento registra o que
já funcionava, o que precisou mudar e o que continua fora do sistema.

## Por que ferro cabe sem reescrever nada

O motor nunca soube o que é alumínio. O que ele sabe é que um **perfil** tem
peso por metro (kg/m), preço por quilo e um comprimento de barra. Ferro é
vendido exatamente assim — metalon, cantoneira, barra chata, tubo e vergalhão
têm peso teórico tabelado (densidade 7,85 kg/dm³) e preço por kg que oscila
com o mercado.

| Conceito no sistema | Alumínio | Ferro |
| --- | --- | --- |
| Perfil | Linha 25, Suprema | Metalon 30x30, cantoneira 1" |
| `pesoPorMetro` | catálogo do fornecedor | peso teórico do aço |
| `precoPorKgCentavos` | R$/kg do distribuidor | R$/kg do distribuidor |
| `comprimentoBarraMm` | 6000 | 6000 (vergalhão: 12000) |
| Plano de corte | otimiza a barra | otimiza a barra |

A aba do catálogo se chama **Perfis e barras**, não "perfis de alumínio", e a
linha de ferro convive com a de alumínio na mesma empresa: quem vende os dois
orça os dois no mesmo orçamento.

## A variedade de vãos é o que as fórmulas resolvem

É o ponto que a Larissa levantou, e é justamente onde o cálculo manual custa
caro: numa grade, o número de barras verticais não é constante — ele sai do
vão. Na tipologia isso é uma fórmula:

```
quantidade  = teto((L - folga) / espacamento) - 1
comprimento = H - folga - 60
```

O `espacamento` é um parâmetro da tipologia, ajustável **item a item** no
orçamento sem mexer no cadastro. A mesma "Grade de proteção - metalon" atende
o vão de 1,00 m e o de 2,40 m:

| Vão | Barras verticais | Barras de 6 m a comprar |
| --- | --- | --- |
| 1000 mm | 8 | 3 |
| 1500 mm | 13 | 4 |
| 2400 mm | 21 | 7 |

Com `espacamento` de 80 mm em vez de 110 mm, o mesmo vão de 1500 mm passa a 18
barras. Sem tocar na tipologia.

## O que precisou mudar: consumível a granel

Ferro consome o que alumínio quase não consome — eletrodo em quilo, tinta e
fundo em m², trilho em metro. O motor arredondava **toda** ferragem pra cima,
que é o certo pra dobradiça e o errado pra solda: 0,48 kg de eletrodo virava
1 kg, 2,4 m² de tinta viravam 3 m², 3,3 m de trilho viravam 4 m.

Numa grade pequena isso inflava o custo em quase 10% — dinheiro que não existe,
espalhado por todos os orçamentos e invisível na tela.

Agora o insumo tem uma marcação de cobrança:

- **por peça** — dobradiça, roldana, fechadura, chumbador. Continua arredondando
  pra cima: meia roldana não existe.
- **granel** — eletrodo (kg), tinta e fundo (m²), trilho e borracha (m). A
  fração é cobrada como está.

Muda no Catálogo de insumos → aba Ferragens → coluna **Cobrança**.

## Instalar o catálogo de ferro

```
npm run db:ferro -w @dilon-zap/erp-db -- --empresa=<slug-da-empresa>
```

Instala numa empresa que já existe:

- 8 perfis (metalon 20x20 / 30x30 / 40x40 / 50x30, cantoneira, barra chata,
  tubo redondo, vergalhão);
- 9 insumos, com eletrodo, fundo, tinta e trilho já marcados como granel;
- 3 tipologias — grade de proteção, portão de correr e guarda-corpo.

É ponto de partida, não verdade absoluta: **o preço por kg é o número que a
serralheria precisa manter atualizado**, e as tipologias existem pra serem
duplicadas e ajustadas ao jeito que aquela serralheria monta.

O script é idempotente e não sobrescreve tipologia que já esteja em uso num
orçamento.

## O que ainda fica fora do sistema

Para não vender o que não existe:

1. **Mão de obra de solda não é medida separadamente.** Ela entra na regra
   geral da empresa (R$/m² e/ou % sobre o custo) ou numa fórmula própria da
   tipologia. Não há "R$ por metro de solda" nem tempo de bancada por peça.
2. **Tratamento de superfície é aproximado pela área da esquadria.** As
   fórmulas usam `AREA * 2` (duas faces). A área desenvolvida real de um
   metalon 30x30 é maior que a área do vão; quem quiser precisão troca o
   multiplicador na fórmula. Galvanização a fogo, cobrada por kg pelo
   galvanizador, cabe como insumo a granel em kg — mas não vem no catálogo.
3. **Corte 1D só.** O plano de corte otimiza barra. Chapa de ferro (2D, para
   portão com chapa lisa ou perfurada) não é otimizada — entra como insumo
   por m².
4. **Peso estrutural não é verificado.** O sistema calcula quanto pesa e
   quanto custa; não diz se aquele metalon aguenta aquele vão. Isso continua
   sendo do serralheiro.
