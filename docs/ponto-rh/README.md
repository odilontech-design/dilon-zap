# Dilon Ponto — controle de ponto e RH digital

> Nome de trabalho. Antes de registrar marca e domínio, pesquise no INPI e no
> Registro.br: "ponto" é um termo genérico e há muitos concorrentes com nomes
> parecidos.

Quarta vertical da Dilon Tech, ao lado do **Zap** (atendimento por WhatsApp),
do **ERP Dilon Contabilidade** e do **Esquadrias**. É um SaaS de controle de
ponto e gestão de jornada para pequenas e médias empresas. Depois que o ponto
estiver vendendo, ele cresce para departamento pessoal (admissão digital,
documentos com assinatura, férias e escalas).

A referência de mercado é o vídeo de demonstração do RH digital da VR, que
usamos como **mapa de funcionalidades que o cliente já espera**. Não usamos
como modelo de marca, de telas ou de texto. O que nos diferencia está em
[`plano-comercial.md`](./plano-comercial.md#4-posicionamento).

## Documentos

| Documento | Para que serve |
| --- | --- |
| [`plano-comercial.md`](./plano-comercial.md) | Mercado, cliente ideal, concorrência, posicionamento, planos e preços, canais de venda, metas e validação antes de construir |
| [`especificacao-produto.md`](./especificacao-produto.md) | O que o sistema faz, módulo por módulo, para cada perfil de acesso, e as regras legais que o motor precisa respeitar |
| [`arquitetura-e-roadmap.md`](./arquitetura-e-roadmap.md) | Como o produto entra no monorepo, o modelo de dados, o motor de jornada e as fases de construção |
| [`landing-page-brief.md`](./landing-page-brief.md) | Briefing da página de vendas, no mesmo formato do de esquadrias |

## Resumo em uma página

**O que vendemos:** registro de ponto pelo celular, pelo computador, por tablet
coletivo ou pelo WhatsApp, com espelho de ponto assinado digitalmente, banco de
horas calculado sozinho e fechamento do mês em poucos cliques.

**Para quem:** empresas de 10 a 300 funcionários. Varejo, clínicas,
restaurantes, indústria leve, prestadores de serviço com equipe externa. Pela
CLT, o ponto é obrigatório a partir de 21 empregados por estabelecimento.

**Por que nós:**

1. **Ponto pelo WhatsApp de verdade.** A Dilon já opera WhatsApp em produção.
   O funcionário que não instala aplicativo bate o ponto numa conversa.
2. **Venda pelo contador.** O ERP Dilon Contabilidade já está dentro de
   escritórios contábeis. O escritório indica o ponto aos clientes dele, e o
   fechamento chega pronto para a folha.
3. **Atendimento próximo, não preço baixo.** Treinamento ao vivo, suporte
   humano por telefone e chat e implantação acompanhada. A tabela deixa margem
   para negociar, principalmente na venda combinada com outra solução da Dilon.

**Planos (hipótese a validar):**

| Plano | Preço | Para quem |
| --- | --- | --- |
| **Essencial** | R$ 59,90/mês fechado | 1 a 10 colaboradores, 2 turnos, 1 CNPJ. Registro por app ou web com GPS, simples ou com foto, cálculos automáticos, espelho, ajustes e relatórios |
| **Ponto** | R$ 9 por colaborador/mês (mín. R$ 99) | Acima de 10 colaboradores, com biometria, quiosque, WhatsApp, fechamento assinado e exportação para a folha |
| **Ponto + DP** | R$ 14 por colaborador/mês (mín. R$ 249) | Mais admissão, documentos, GED e férias |
| **RH Completo** | R$ 19 por colaborador/mês (mín. R$ 399) | Mais escalas e painel de risco |

**Como construímos:** Next.js + Prisma + Postgres, como o Esquadrias. Banco
próprio, motor de cálculo de jornada em um pacote puro e testável
(`packages/ponto-core`) e o celular como PWA antes de qualquer app nativo.

**Ordem:**

1. **Validação** (3 semanas): landing, 15 conversas, 3 pilotos pré-pagos.
2. **MVP do ponto** (8 semanas).
3. **Conformidade REP-P**, reconhecimento facial, quiosque e WhatsApp (6 semanas).
4. **Módulos de DP** (8 semanas).
5. **Escalas e indicadores de risco.**

Detalhes e critérios de passagem de uma fase para outra estão em
[`arquitetura-e-roadmap.md`](./arquitetura-e-roadmap.md#6-roadmap).

## Antes de vender: dois pontos que exigem profissional

- **Jurídico trabalhista:** revisar o motor de jornada, o texto do termo de uso
  e a forma de enquadramento como REP-P (Portaria MTP 671/2021). Os números
  legais citados nesta pasta são o ponto de partida, não um parecer.
- **LGPD:** reconhecimento facial é dado pessoal sensível (art. 11). Precisa de
  relatório de impacto (RIPD), base legal definida e alternativa sem biometria
  para quem não consentir.
