# Concorrente: Boom Sistemas (e o site da Elite Motors)

Fonte: prints do site da Elite Motors (`elitemotorscaxias.com.br`) e da página de planos da Boom Sistemas
(`boomsistemas.com.br`), enviados pelo fundador em 23/11/2026. Não vimos o painel por dentro, só a propaganda.
Os números de clientes são **alegação da própria Boom**, não verificados.

## Quem é a Boom

- Sistema para lojas de veículos: estoque, contratos, financeiro, nota fiscal, CRM, integrador de portais e site.
- Diz ter **+1.500 revendas ativas**, **+10.000 usuários**, **+180 mil vendas transacionadas em 2025** e **+10 anos**.
- Benefícios anunciados: treinamento personalizado, acesso de qualquer local.

## Planos e preços (por mês, como anunciado)

| Plano | Preço | O que traz |
|---|---|---|
| Emissor Fiscal | R$ 319 | Nota fiscal de veículo e de serviço, notas de entrada e saída, integração com a SEFAZ e com o estoque |
| Essencial | R$ 689 | Estoque, contratos, assinatura eletrônica, financeiro completo, integrador com 30+ plataformas, nota fiscal, relatórios, clientes e fornecedores, site profissional e e-mails, veículos e usuários ilimitados, arquivo digital |
| Premium (mais vendido) | R$ 878 | Tudo do Essencial + CRM (WhatsApp, Instagram Direct, Messenger, 50+ portais enviando lead, funil Kanban, campanhas em massa pela API oficial do WhatsApp, "mercado de leads") + vistoria (checklist, fotos, relatórios) |

**Marcados como "não incluso" em todos os planos** (indício de extra pago): IA de pré-atendimento no CRM,
simulador multibanco, pesquisas veiculares (débito, leilão, sinistro).

## Site da Elite Motors (feito pela Boom)

- Tema escuro, menu (Home, Sobre, Veículos, Ficha cadastral, Venda seu veículo, Contato), busca, faixa de logos das marcas.
- Filtros: modelo, ano e valor (barras deslizantes), ordenar por.
- Card: ano, km, combustível, preço, logo da marca, "+ detalhes". Botão flutuante de WhatsApp e barra social.
- Rodapé: "Ficha cadastral" e "Quer vender seu veículo", endereço, mapa, "Desenvolvido por Boom Sistemas".
- O mapa do rodapé mostra concorrentes da região (inclusive a Sales Automóveis): a Elite fica no Parque Duque,
  Duque de Caxias, o mesmo bairro do nosso piloto.

## Comparação com o Dilon Motors (em 23/11/2026)

| | Dilon Motors | Boom |
|---|---|---|
| Estoque, portais, site, feeds, relatórios | Tem | Tem |
| Ficha de financiamento e "Venda seu carro" | Tem | Tem |
| Preço "sob consulta" e km "n/a" com seletor | Tem | Não vimos |
| WhatsApp nativo na central de atendimento | Tem (produto base) | CRM "integrado" |
| Vendedor IA de carros | v1.97.0; falta chave da API em produção | Extra pago |
| Contrato em PDF / assinatura eletrônica | Falta | Plano base |
| Nota fiscal | Falta | Tem |
| Consulta veicular, simulador multibanco | Falta | Extra |
| Vistoria com checklist e fotos | Falta | Premium |

## Recomendações

1. Antecipar o **contrato em PDF** (estava no Sprint 4) para o Sprint 2 ou 3; assinatura eletrônica depois.
2. **Não construir nota fiscal** agora (área fiscal, risco e manutenção altos). Se pedirem, parceria com serviço pronto.
3. A diferença para vender é a **IA no WhatsApp**: fechar a chave da Anthropic, "Testar conexão" e teste com ~20 conversas reais.
4. Conferir no nosso site: faixa de logos das marcas e filtro de ano e valor com barra deslizante.
5. Comercial: a Elite (25 anos de loja, ~93 ofertas no NaPista) é um alvo. Argumento: migração com o estoque importado e
   IA no WhatsApp. Decisão de abordar (e de pedir à Sales) é do fundador.

## Pendências para fechar a comparação

- Preço do Dilon Motors (Super Admin) para posicionar contra R$ 689 a R$ 878.
- Demonstração da Boom pedida pelo fundador, para ver o painel real.
