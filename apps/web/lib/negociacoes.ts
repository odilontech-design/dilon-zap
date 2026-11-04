import { exigeValorNaEtapa, origemCanonica } from "@/lib/origens";
import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * Tudo que MUDA uma negociação passa por aqui, e cada mudança grava o evento
 * correspondente na mesma transação.
 *
 * O histórico não é enfeite: os indicadores de conversão leem dele (ver
 * funil-indicadores.ts). Uma rota que mudasse a etapa sem gravar o evento
 * faria a negociação "pular" a etapa nas estatísticas, e a taxa de conversão
 * ficaria errada sem erro nenhum. Por isso as rotas não chamam
 * `prisma.negociacao.update` direto.
 *
 * Quem chama já conferiu que a negociação é do tenant da sessão.
 */

type Quem = Pick<CurrentUser, "id" | "name">;

type NegociacaoAtual = {
  id: string;
  funilId: string;
  stageId: string;
  status: "ABERTA" | "GANHA" | "PERDIDA";
};

export class ErroDeNegocio extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A etapa tem que ser do mesmo funil da negociação — não se "pula" de funil movendo. */
async function etapaDoFunil(stageId: string, funilId: string) {
  const etapa = await prisma.stage.findFirst({ where: { id: stageId, funilId } });
  if (!etapa) throw new ErroDeNegocio("etapa não pertence a este funil", 400);
  return etapa;
}

export async function criarNegociacao(args: {
  tenantId: string;
  quem: Quem;
  contactId: string;
  funilId: string;
  stageId: string;
  titulo: string;
  valorCents: number;
  recorrencia: "UNICA" | "MENSAL";
  responsavelId: string | null;
  origem: string | null;
  previsaoFechamento: Date | null;
}) {
  const etapa = await etapaDoFunil(args.stageId, args.funilId);
  const faltaValor = await exigeValorNaEtapa(etapa.id, args.valorCents);
  if (faltaValor) throw new ErroDeNegocio(faltaValor, 422);
  return prisma.$transaction(async (tx) => {
    const negociacao = await tx.negociacao.create({
      data: {
        tenantId: args.tenantId,
        contactId: args.contactId,
        funilId: args.funilId,
        stageId: etapa.id,
        titulo: args.titulo,
        valorCents: args.valorCents,
        recorrencia: args.recorrencia,
        responsavelId: args.responsavelId,
        origem: args.origem,
        previsaoFechamento: args.previsaoFechamento,
        valorMensalCents: valorMensalSemItens(args.valorCents, args.recorrencia),
      },
    });
    // Funil com "ligar automaticamente": toda negociação nova ganha a tarefa
    // de ligar para amanhã às 9h (horário de Brasília), de quem é responsável
    // — ou de quem criou, se ninguém foi indicado.
    const funil = await tx.funil.findUnique({ where: { id: args.funilId }, select: { tarefaLigarAuto: true } });
    if (funil?.tarefaLigarAuto) {
      const amanha = new Date();
      amanha.setUTCDate(amanha.getUTCDate() + 1);
      amanha.setUTCHours(12, 0, 0, 0); // 09:00 em Brasília
      await tx.tarefaNegociacao.create({
        data: {
          tenantId: args.tenantId,
          negociacaoId: negociacao.id,
          tipo: "LIGACAO",
          titulo: "Ligar para o cliente",
          venceEm: amanha,
          responsavelId: args.responsavelId ?? args.quem.id,
        },
      });
    }
    await tx.historicoDeEtapa.create({
      data: {
        negociacaoId: negociacao.id,
        tipo: "CRIADA",
        paraStageId: etapa.id,
        paraEtapaNome: etapa.name,
        porUserId: args.quem.id,
        porNome: args.quem.name,
      },
    });
    return negociacao;
  });
}

export async function moverNegociacao(n: NegociacaoAtual, stageId: string, quem: Quem) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("reabra a negociação antes de mover", 409);
  if (n.stageId === stageId) return;

  const atual = await prisma.negociacao.findUnique({ where: { id: n.id }, select: { valorCents: true } });
  const faltaValor = await exigeValorNaEtapa(stageId, atual?.valorCents);
  if (faltaValor) throw new ErroDeNegocio(faltaValor, 422);

  const [de, para] = await Promise.all([
    prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } }),
    etapaDoFunil(stageId, n.funilId),
  ]);

  await prisma.$transaction([
    prisma.negociacao.update({ where: { id: n.id }, data: { stageId: para.id, etapaDesde: new Date() } }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "ETAPA",
        deStageId: n.stageId,
        paraStageId: para.id,
        deEtapaNome: de?.name ?? null,
        paraEtapaNome: para.name,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

export async function ganharNegociacao(n: NegociacaoAtual, quem: Quem) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("a negociação já foi encerrada", 409);
  const etapa = await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } });
  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: { status: "GANHA", fechadaEm: new Date(), motivoPerdaId: null, detalhePerda: null },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "GANHA",
        deStageId: n.stageId,
        deEtapaNome: etapa?.name ?? null,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

export async function perderNegociacao(
  n: NegociacaoAtual,
  tenantId: string,
  motivo: { motivoPerdaId: string | null; detalhe: string | null },
  quem: Quem
) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("a negociação já foi encerrada", 409);

  // Perda sem motivo não ensina nada: a lista existe pra responder "por que
  // estamos perdendo?". O motivo precisa ser da empresa.
  if (!motivo.motivoPerdaId) throw new ErroDeNegocio("informe o motivo da perda", 400);
  const m = await prisma.motivoDePerda.findFirst({ where: { id: motivo.motivoPerdaId, tenantId } });
  if (!m) throw new ErroDeNegocio("motivo de perda inválido", 400);

  const etapa = await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } });
  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: { status: "PERDIDA", fechadaEm: new Date(), motivoPerdaId: m.id, detalhePerda: motivo.detalhe },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "PERDIDA",
        deStageId: n.stageId,
        deEtapaNome: etapa?.name ?? null,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

/** Reabre uma negociação encerrada, opcionalmente numa etapa específica. */
export async function reabrirNegociacao(n: NegociacaoAtual, quem: Quem, stageId?: string) {
  if (n.status === "ABERTA") throw new ErroDeNegocio("a negociação já está aberta", 409);
  const destino = stageId ? await etapaDoFunil(stageId, n.funilId) : null;
  const alvoId = destino?.id ?? n.stageId;
  const alvoNome = destino?.name ?? (await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } }))?.name ?? null;

  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: {
        status: "ABERTA",
        fechadaEm: null,
        motivoPerdaId: null,
        detalhePerda: null,
        stageId: alvoId,
        // Reabrir recomeça a contagem de "parada": senão ela voltaria já
        // marcada como esquecida, com a data de meses atrás.
        etapaDesde: new Date(),
      },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "REABERTA",
        paraStageId: alvoId,
        paraEtapaNome: alvoNome,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

/* ------------------------------------------------------------------------ *
 * Ponte com a ficha do contato
 *
 * Contatos, Inbox e a ficha do cliente ainda mostram e editam "etapa" e
 * "valor" no contato. No modelo novo isso é a NEGOCIAÇÃO ABERTA dele. Em vez
 * de reescrever essas telas, a leitura deriva os dois campos da negociação
 * aberta mais recente e a escrita passa pelas mesmas funções que gravam o
 * histórico — assim mexer na etapa pela ficha e pelo quadro dá no mesmo, e
 * os indicadores enxergam as duas.
 * ------------------------------------------------------------------------ */

/** Seleção Prisma da negociação aberta mais recente, para embutir em select de Contact. */
export const NEGOCIACAO_ABERTA_DO_CONTATO = {
  where: { status: "ABERTA" as const },
  orderBy: { updatedAt: "desc" as const },
  take: 1,
  select: {
    stageId: true,
    valorCents: true,
    stage: { select: { id: true, name: true, color: true, position: true } },
  },
};

type AbertaDoContato = {
  stageId: string;
  valorCents: number;
  stage: { id: string; name: string; color: string; position: number };
};

/** Os campos que as telas antigas esperam no contato, vindos da negociação aberta. */
export function camposDoContato(negociacoes: AbertaDoContato[]) {
  const n = negociacoes[0];
  return {
    stageId: n?.stageId ?? null,
    dealValueCents: n?.valorCents ?? 0,
    stage: n?.stage ?? null,
  };
}

/**
 * Aplica "etapa" e/ou "valor" digitados na ficha do contato.
 *
 * - Etapa: move a negociação aberta daquele funil, ou abre uma se o contato
 *   ainda não tinha. "Sem etapa" (null) não encerra nada: tirar alguém do
 *   funil é ganhar ou perder a negociação, com motivo.
 * - Valor: vai para a negociação aberta mais recente.
 */
export async function aplicarEtapaEValorDoContato(args: {
  tenantId: string;
  quem: Quem;
  contato: { id: string; name: string | null; phoneNumber: string | null; waJid: string };
  stageId?: string | null;
  dealValueCents?: number;
  /** Só ao ABRIR uma negociação por aqui (empresas que exigem os dados). */
  responsavelId?: string | null;
  origem?: string | null;
}) {
  const { tenantId, quem, contato } = args;

  if (args.stageId) {
    const etapa = await prisma.stage.findFirst({
      where: { id: args.stageId, tenantId, funilId: { not: null } },
      select: { id: true, funilId: true },
    });
    if (!etapa?.funilId) throw new ErroDeNegocio("etapa inválida", 400);

    const aberta = await prisma.negociacao.findFirst({
      where: { contactId: contato.id, funilId: etapa.funilId, status: "ABERTA" },
      orderBy: { updatedAt: "desc" },
    });
    if (aberta) {
      // O valor digitado junto entra antes: a etapa pode exigi-lo.
      if (args.dealValueCents !== undefined) {
        await prisma.negociacao.update({ where: { id: aberta.id }, data: { valorCents: args.dealValueCents } });
        await recalcularValores(aberta.id);
      }
      await moverNegociacao(aberta, etapa.id, quem);
    } else {
      if (args.responsavelId) {
        const resp = await prisma.user.findFirst({ where: { id: args.responsavelId, tenantId }, select: { id: true } });
        if (!resp) throw new ErroDeNegocio("responsável inválido", 400);
      }
      await criarNegociacao({
        tenantId,
        quem,
        contactId: contato.id,
        funilId: etapa.funilId,
        stageId: etapa.id,
        titulo: contato.name?.trim() || contato.phoneNumber || contato.waJid.split("@")[0],
        valorCents: args.dealValueCents ?? 0,
        recorrencia: "UNICA",
        responsavelId: args.responsavelId ?? quem.id,
        origem: await origemCanonica(tenantId, args.origem),
        previsaoFechamento: null,
      });
      // O valor já entrou na negociação nova; não precisa do passo seguinte.
      return;
    }
  }

  if (args.dealValueCents !== undefined) {
    const aberta = await prisma.negociacao.findFirst({
      where: { contactId: contato.id, status: "ABERTA" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (aberta) {
      await prisma.negociacao.update({ where: { id: aberta.id }, data: { valorCents: args.dealValueCents } });
      await recalcularValores(aberta.id);
    }
  }
}

/* ------------------------------------------------------------------------ *
 * Valor, itens e pedido
 * ------------------------------------------------------------------------ */

/** Sem itens, o mensal é o valor inteiro quando a cobrança é mensal. */
export function valorMensalSemItens(valorCents: number, recorrencia: "UNICA" | "MENSAL"): number {
  return recorrencia === "MENSAL" ? valorCents : 0;
}

/**
 * Reconcilia valor, valor mensal e recorrência de uma negociação.
 *
 * Com itens, o valor é DERIVADO deles (quantidade × preço) e o mensal é só a
 * soma dos itens de cobrança mensal — assim uma taxa de implantação única
 * somada ao plano não infla o MRR. Sem itens, vale o que foi digitado.
 *
 * Chamar depois de QUALQUER escrita em valor, recorrência ou itens: é o único
 * lugar que mantém os três campos coerentes entre si.
 */
export async function recalcularValores(negociacaoId: string) {
  const n = await prisma.negociacao.findUnique({
    where: { id: negociacaoId },
    select: { valorCents: true, recorrencia: true, itens: { select: { precoUnitCents: true, quantidade: true, cobranca: true } } },
  });
  if (!n) return;

  if (n.itens.length > 0) {
    const total = n.itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);
    const mensal = n.itens.filter((i) => i.cobranca === "MENSAL").reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);
    await prisma.negociacao.update({
      where: { id: negociacaoId },
      data: { valorCents: total, valorMensalCents: mensal, recorrencia: mensal > 0 ? "MENSAL" : "UNICA" },
    });
    return;
  }

  await prisma.negociacao.update({
    where: { id: negociacaoId },
    data: { valorMensalCents: valorMensalSemItens(n.valorCents, n.recorrencia) },
  });
}

export type ItemIn = {
  productId?: string | null;
  nomeProduto: string;
  precoTabelaCents: number;
  precoUnitCents: number;
  quantidade: number;
  cobranca: "UNICA" | "MENSAL";
};

/** Troca a lista de itens inteira (a tela edita como um bloco) e recalcula o valor. */
export async function salvarItens(negociacaoId: string, tenantId: string, itens: ItemIn[]) {
  // O produto, quando informado, precisa ser da empresa — senão dava para
  // pendurar o catálogo de outra empresa numa proposta.
  const ids = [...new Set(itens.map((i) => i.productId).filter((x): x is string => !!x))];
  if (ids.length) {
    const validos = await prisma.product.count({ where: { id: { in: ids }, tenantId } });
    if (validos !== ids.length) throw new ErroDeNegocio("produto inválido", 400);
  }

  await prisma.$transaction([
    prisma.negociacaoItem.deleteMany({ where: { negociacaoId } }),
    ...(itens.length
      ? [
          prisma.negociacaoItem.createMany({
            data: itens.map((i) => ({
              negociacaoId,
              productId: i.productId ?? null,
              nomeProduto: i.nomeProduto,
              precoTabelaCents: i.precoTabelaCents,
              precoUnitCents: i.precoUnitCents,
              quantidade: i.quantidade,
              cobranca: i.cobranca,
            })),
          }),
        ]
      : []),
  ]);
  await recalcularValores(negociacaoId);
}

/**
 * Cria o RASCUNHO de pedido com os itens da negociação. O resto do fluxo
 * (enviar ao financeiro, fechar, receber) é o de sempre, em Pedidos.
 *
 * Um pedido ativo por negociação: clicar duas vezes não pode gerar dois
 * pedidos iguais — o segundo, fechado, baixaria o estoque em dobro.
 */
export async function gerarPedido(n: { id: string; contactId: string }, tenantId: string, quem: Quem) {
  const itens = await prisma.negociacaoItem.findMany({ where: { negociacaoId: n.id } });
  // Condição de pagamento combinada na negociação: o pedido nasce com ela, e o
  // financeiro só confere ao fechar (pedido da Believe, 13/10).
  const pag = await prisma.negociacao.findUnique({
    where: { id: n.id },
    select: { pagForma: true, pagEntradaCents: true, pagNumParcelas: true, pagPeriodicidade: true, pagPrimeiroVencimento: true },
  });
  if (itens.length === 0) throw new ErroDeNegocio("adicione itens à negociação antes de gerar o pedido", 400);

  const existente = await prisma.order.findFirst({
    where: { negociacaoId: n.id, status: { not: "CANCELADO" } },
    select: { id: true, numero: true },
  });
  if (existente) throw new ErroDeNegocio(`já existe o pedido #${existente.numero} para esta negociação`, 409);

  // A conversa mais recente do contato, para o pedido aparecer no Inbox junto
  // do atendimento. Sem conversa, o pedido nasce solto — o modelo já permite.
  const conversa = await prisma.conversation.findFirst({
    where: { tenantId, contactId: n.contactId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  return prisma.order.create({
    data: {
      tenantId,
      contactId: n.contactId,
      conversationId: conversa?.id ?? null,
      createdById: quem.id,
      negociacaoId: n.id,
      paymentMethod: pag?.pagForma ?? null,
      planoEntradaCents: pag?.pagForma === "FIADO" ? pag.pagEntradaCents : null,
      planoNumParcelas: pag?.pagForma === "FIADO" ? pag.pagNumParcelas : null,
      planoPeriodicidade: pag?.pagForma === "FIADO" ? pag.pagPeriodicidade : null,
      planoPrimeiroVencimento: pag?.pagPrimeiroVencimento ?? null,
      items: {
        create: itens.map((i) => ({
          productId: i.productId,
          nomeProduto: i.nomeProduto,
          precoTabelaCents: i.precoTabelaCents,
          precoUnitCents: i.precoUnitCents,
          quantidade: i.quantidade,
        })),
      },
    },
    select: { id: true, numero: true },
  });
}

/* ------------------------------------------------------------------------ *
 * Entre funis
 * ------------------------------------------------------------------------ */

async function funilEEtapa(tenantId: string, funilId: string, stageId: string) {
  const funil = await prisma.funil.findFirst({
    where: { id: funilId, tenantId, arquivadoEm: null },
    select: { id: true, nome: true },
  });
  if (!funil) throw new ErroDeNegocio("funil não encontrado", 404);
  const etapa = await etapaDoFunil(stageId, funil.id);
  return { funil, etapa };
}

/**
 * Leva a negociação para outro funil (ex.: de "Prospecção" para "Vendas").
 * Grava um evento ETAPA com os nomes "Funil · Etapa" dos dois lados: a
 * negociação chega à etapa nova do outro funil e os indicadores de lá a
 * enxergam; os do funil de origem deixam de contar com ela, porque ela não
 * é mais de lá.
 *
 * Só em andamento: ganha ou perdida já encerrou o ciclo naquele funil — o
 * próximo passo (pós-venda, renovação) é Duplicar, que preserva o resultado.
 */
export async function moverParaOutroFunil(
  n: NegociacaoAtual & { tenantId: string },
  destino: { funilId: string; stageId: string },
  quem: Quem
) {
  if (n.status !== "ABERTA") {
    throw new ErroDeNegocio("só negociação em andamento muda de funil — para uma ganha ou perdida, use Duplicar", 409);
  }
  if (n.funilId === destino.funilId) throw new ErroDeNegocio("a negociação já está neste funil", 400);

  const [{ funil, etapa }, origem] = await Promise.all([
    funilEEtapa(n.tenantId, destino.funilId, destino.stageId),
    prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true, funil: { select: { nome: true } } } }),
  ]);

  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: { funilId: funil.id, stageId: etapa.id, etapaDesde: new Date() },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "ETAPA",
        deStageId: n.stageId,
        paraStageId: etapa.id,
        deEtapaNome: origem ? `${origem.funil?.nome ?? "?"} · ${origem.name}` : null,
        paraEtapaNome: `${funil.nome} · ${etapa.name}`,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

/**
 * Cria uma cópia da negociação em outro funil (ou no mesmo), com os mesmos
 * dados e produtos. A original fica como está — é o caso do pós-venda: a
 * venda continua ganha no funil comercial e começa um ciclo novo no outro.
 * Tarefas, anotações e arquivos não vão junto (são do ciclo antigo); uma
 * anotação em cada lado registra de onde veio e para onde foi.
 */
export async function duplicarEmOutroFunil(
  negociacaoId: string,
  tenantId: string,
  destino: { funilId: string; stageId: string },
  quem: Quem
) {
  const original = await prisma.negociacao.findFirst({
    where: { id: negociacaoId, tenantId },
    include: { itens: true, funil: { select: { nome: true } } },
  });
  if (!original) throw new ErroDeNegocio("negociação não encontrada", 404);
  const { funil, etapa } = await funilEEtapa(tenantId, destino.funilId, destino.stageId);

  const copia = await criarNegociacao({
    tenantId,
    quem,
    contactId: original.contactId,
    funilId: funil.id,
    stageId: etapa.id,
    titulo: original.titulo,
    valorCents: original.valorCents,
    recorrencia: original.recorrencia,
    responsavelId: original.responsavelId,
    origem: original.origem,
    previsaoFechamento: original.previsaoFechamento,
  });

  // A cópia sabe de onde veio: relatórios de "todos os funis" não a contam de novo.
  await prisma.negociacao.update({ where: { id: copia.id }, data: { duplicadaDeId: original.id } });

  // A condição de pagamento combinada vai junto com a cópia.
  if (original.pagForma) {
    await prisma.negociacao.update({
      where: { id: copia.id },
      data: {
        pagForma: original.pagForma,
        pagEntradaCents: original.pagEntradaCents,
        pagNumParcelas: original.pagNumParcelas,
        pagPeriodicidade: original.pagPeriodicidade,
        pagPrimeiroVencimento: original.pagPrimeiroVencimento,
      },
    });
  }

  if (original.itens.length > 0) {
    await prisma.negociacaoItem.createMany({
      data: original.itens.map((i) => ({
        negociacaoId: copia.id,
        productId: i.productId,
        nomeProduto: i.nomeProduto,
        precoTabelaCents: i.precoTabelaCents,
        precoUnitCents: i.precoUnitCents,
        quantidade: i.quantidade,
        cobranca: i.cobranca,
      })),
    });
    await recalcularValores(copia.id);
  }

  await prisma.negociacaoNota.createMany({
    data: [
      {
        tenantId,
        negociacaoId: copia.id,
        texto: `Criada a partir da negociação do funil ${original.funil.nome}.`,
        porUserId: quem.id,
        porNome: quem.name,
      },
      {
        tenantId,
        negociacaoId: original.id,
        texto: `Duplicada para o funil ${funil.nome} (${etapa.name}).`,
        porUserId: quem.id,
        porNome: quem.name,
      },
    ],
  });

  return copia;
}

/* ------------------------------------------------------------------------ *
 * Valor vindo dos pedidos
 * ------------------------------------------------------------------------ */

/** Até quantos dias depois de ganha uma negociação ainda recebe o pedido do cliente. */
const DIAS_GANHA_RECEBE_PEDIDO = 15;

/**
 * Liga o pedido montado na conversa à negociação do cliente e leva o valor
 * para o CRM (reunião Believe, 29/10). Antes, só o pedido gerado DENTRO da
 * negociação ficava ligado — e a equipe monta tudo pela conversa, então
 * nenhuma negociação recebia valor e o funil mostrava R$ 0.
 *
 * Escolhe a negociação em andamento mais recente do cliente; sem nenhuma, a
 * ganha há pouco tempo (é comum marcar ganha e o pedido fechar depois). Sem
 * nenhuma das duas, o pedido fica solto — não inventa negociação.
 *
 * Nunca derruba o fluxo do pedido: falhar aqui só deixa o CRM sem o valor.
 */
export async function vincularPedidoANegociacao(orderId: string) {
  try {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true, contactId: true, negociacaoId: true, status: true },
    });
    if (!o) return;
    let negociacaoId = o.negociacaoId;
    if (!negociacaoId && o.status !== "CANCELADO") {
      const aberta = await prisma.negociacao.findFirst({
        where: { tenantId: o.tenantId, contactId: o.contactId, status: "ABERTA" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      const ganha = aberta
        ? null
        : await prisma.negociacao.findFirst({
            where: {
              tenantId: o.tenantId,
              contactId: o.contactId,
              status: "GANHA",
              fechadaEm: { gte: new Date(Date.now() - DIAS_GANHA_RECEBE_PEDIDO * 86_400_000) },
            },
            orderBy: { fechadaEm: "desc" },
            select: { id: true },
          });
      negociacaoId = aberta?.id ?? ganha?.id ?? null;
      if (!negociacaoId) return;
      await prisma.order.update({ where: { id: o.id }, data: { negociacaoId } });
    }
    if (negociacaoId) await valorDosPedidos(negociacaoId);
  } catch (e) {
    console.error("[negociacao] falha ao levar o pedido para o CRM", orderId, e);
  }
}

/**
 * O valor da negociação passa a ser a soma dos pedidos dela que não foram
 * cancelados: o fechado vale o total (com desconto), o em montagem vale a
 * soma dos itens. Negociação com itens próprios não muda — lá os itens mandam.
 */
export async function valorDosPedidos(negociacaoId: string) {
  const n = await prisma.negociacao.findUnique({ where: { id: negociacaoId }, select: { _count: { select: { itens: true } } } });
  if (!n || n._count.itens > 0) return;
  const pedidos = await prisma.order.findMany({
    where: { negociacaoId, status: { not: "CANCELADO" } },
    select: { status: true, totalCents: true, items: { select: { precoUnitCents: true, quantidade: true } } },
  });
  if (pedidos.length === 0) return;
  const total = pedidos.reduce(
    (s, p) => s + (p.status === "FECHADO" ? p.totalCents : p.items.reduce((t, i) => t + i.precoUnitCents * i.quantidade, 0)),
    0
  );
  await prisma.negociacao.update({ where: { id: negociacaoId }, data: { valorCents: total } });
  await recalcularValores(negociacaoId);
}
