import { prisma } from "@dilon-zap/db";
import type { PaymentMethod, Prisma, TipoParcela } from "@prisma/client";
import {
  alocarRecebimento,
  diasDeAtraso,
  diaAoMeioDia,
  faixaDeVencimento,
  gerarParcelas,
  ordenarParaQuitar,
  precisaLembrarHoje,
  situacaoDaParcela,
  type PlanoDeParcelas,
  type StatusParcela,
} from "@dilon-zap/receivables";

/**
 * Contas a receber com parcelas.
 *
 * Duas regras atravessam o arquivo, ambas herdadas do desenho do estoque e do
 * saldo do pedido:
 *
 *  1. O que se GRAVA é o dinheiro que entrou (Pagamento). A situação da parcela
 *     — paga, pendente, quanto falta — é sempre calculada a partir dele. Nada
 *     de um campo "paga" que alguém lembre ou esqueça de atualizar.
 *
 *  2. Todo recebimento numa conta com parcelas aponta para UMA parcela. Um
 *     pagamento maior que a parcela vira várias linhas, uma por parcela
 *     quitada, em vez de uma linha ambígua que ninguém sabe a quem pertence.
 *
 * Quando a conta nasce de um pedido, o pedido continua com o próprio cache
 * (`pago`, `pagoEm`, `vencimento`), que o resto do sistema lê. Ele é refeito
 * por `sincronizarPedido` na mesma transação de toda mudança aqui — nunca
 * escrito por fora.
 */

export type Db = Prisma.TransactionClient;

export class ErroDeConta extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type ParcelaComPagamentos = Prisma.ParcelaGetPayload<{ include: { pagamentos: true } }>;

function situacao(p: ParcelaComPagamentos) {
  return situacaoDaParcela(
    {
      id: p.id,
      numero: p.numero,
      tipo: p.tipo,
      vencimento: p.vencimento,
      valorCents: p.valorCents,
      canceladaEm: p.canceladaEm,
      reembolsadaEm: p.reembolsadaEm,
    },
    p.pagamentos.map((x) => ({ valorCents: x.valorCents, recebidoEm: x.recebidoEm, meio: x.meio }))
  );
}

/* ------------------------------------------------------------------ criação */

export type NovaContaInput = {
  tenantId: string;
  contactId: string;
  descricao?: string | null;
  plano: PlanoDeParcelas;
  userId?: string;
};

/** Conta digitada à mão: o cliente deve, e a gente combinou como ele paga. */
export async function criarContaManual(db: Db, input: NovaContaInput) {
  const contato = await db.contact.findFirst({ where: { id: input.contactId, tenantId: input.tenantId }, select: { id: true } });
  if (!contato) throw new ErroDeConta("cliente não encontrado", 404);

  let parcelas;
  try {
    parcelas = gerarParcelas(input.plano);
  } catch (e) {
    throw new ErroDeConta((e as Error).message);
  }

  return db.contaReceber.create({
    data: {
      tenantId: input.tenantId,
      contactId: contato.id,
      origem: "MANUAL",
      descricao: input.descricao?.trim() || null,
      createdById: input.userId,
      parcelas: {
        create: parcelas.map((p) => ({
          tenantId: input.tenantId,
          numero: p.numero,
          totalParcelas: p.totalParcelas,
          tipo: p.tipo,
          vencimento: p.vencimento,
          valorCents: p.valorCents,
        })),
      },
    },
    select: { id: true },
  });
}

/**
 * A conta de um pedido que está devendo, com uma parcela do tamanho do total.
 * Idempotente: se já existe, devolve a existente.
 *
 * Recebimentos que o pedido já tinha (antes de existir parcela) passam a
 * apontar para esta parcela — é o que a migração e o estorno de pedido antigo
 * precisam.
 */
export async function garantirContaDoPedido(db: Db, orderId: string, userId?: string) {
  const existente = await db.contaReceber.findUnique({ where: { orderId }, select: { id: true } });
  if (existente) return existente;

  const pedido = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, tenantId: true, contactId: true, totalCents: true, vencimento: true, numero: true },
  });
  if (pedido.totalCents <= 0) throw new ErroDeConta("pedido sem valor não gera conta a receber");

  const conta = await db.contaReceber.create({
    data: {
      tenantId: pedido.tenantId,
      contactId: pedido.contactId,
      orderId: pedido.id,
      origem: "PEDIDO",
      descricao: `Pedido #${pedido.numero}`,
      createdById: userId,
      parcelas: {
        create: {
          tenantId: pedido.tenantId,
          numero: 1,
          totalParcelas: 1,
          tipo: "UNICA",
          vencimento: pedido.vencimento ? diaAoMeioDia(pedido.vencimento) : null,
          valorCents: pedido.totalCents,
        },
      },
    },
    select: { id: true, parcelas: { select: { id: true } } },
  });

  // O que já tinha entrado neste pedido passa a ser da parcela.
  await db.pagamento.updateMany({
    where: { orderId: pedido.id, contaId: null },
    data: { contaId: conta.id, parcelaId: conta.parcelas[0].id },
  });
  return { id: conta.id };
}

/* ------------------------------------------------------------- recebimentos */

export type ReceberInput = {
  tenantId: string;
  contaId: string;
  valorCents: number;
  parcelaId?: string | null;
  meio?: PaymentMethod | null;
  recebidoEm?: Date;
  observacao?: string | null;
  userId?: string;
};

async function carregarConta(db: Db, tenantId: string, contaId: string) {
  const conta = await db.contaReceber.findFirst({
    where: { id: contaId, tenantId },
    include: { parcelas: { include: { pagamentos: true } } },
  });
  if (!conta) throw new ErroDeConta("conta não encontrada", 404);
  if (conta.canceladaEm) throw new ErroDeConta("conta cancelada", 409);
  return conta;
}

/** Recebe dinheiro numa conta: reparte entre as parcelas e mantém o pedido em dia. */
export async function receberNaConta(db: Db, input: ReceberInput) {
  const conta = await carregarConta(db, input.tenantId, input.contaId);

  const abertas = conta.parcelas
    .map((p) => ({ p, s: situacao(p) }))
    .filter((x) => x.s.status === "PENDENTE")
    .map((x) => ({ id: x.p.id, tipo: x.p.tipo, vencimento: x.p.vencimento, numero: x.p.numero, saldoCents: x.s.saldoCents }));

  let aloc;
  try {
    aloc = alocarRecebimento(abertas, input.valorCents, input.parcelaId);
  } catch (e) {
    throw new ErroDeConta((e as Error).message);
  }

  const recebidoEm = input.recebidoEm ?? new Date();
  for (const a of aloc) {
    await db.pagamento.create({
      data: {
        orderId: conta.orderId,
        contaId: conta.id,
        parcelaId: a.parcelaId,
        valorCents: a.valorCents,
        meio: input.meio ?? undefined,
        recebidoEm,
        observacao: input.observacao?.trim() || null,
        createdById: input.userId,
      },
    });
  }

  const saldo = await sincronizarConta(db, conta.id);
  return { saldoDepois: saldo.saldoCents, quitado: saldo.saldoCents <= 0, parcelasAtingidas: aloc.length };
}

/**
 * Desfaz um recebimento: o dinheiro volta a ser dívida. Estorno é um pagamento
 * NEGATIVO, nunca a edição do anterior — o extrato não é reescrito.
 *
 * Com `parcelaId`, estorna só aquela; sem, desfaz a partir da última parcela paga.
 */
export async function estornarNaConta(
  db: Db,
  input: { tenantId: string; contaId: string; valorCents?: number; parcelaId?: string | null; observacao?: string | null; userId?: string; recebidoEm?: Date }
) {
  const conta = await carregarConta(db, input.tenantId, input.contaId);

  const pagas = conta.parcelas
    .map((p) => ({ p, s: situacao(p) }))
    .filter((x) => x.s.pagoCents > 0 && !x.p.canceladaEm && !x.p.reembolsadaEm)
    .filter((x) => !input.parcelaId || x.p.id === input.parcelaId);

  const disponivel = pagas.reduce((s, x) => s + x.s.pagoCents, 0);
  const alvo = input.valorCents ?? disponivel;
  if (alvo <= 0 || alvo > disponivel) {
    throw new ErroDeConta(`não há tanto recebido para estornar (recebido: ${(disponivel / 100).toFixed(2)})`);
  }

  // Do fim para o começo: a parcela quitada por último é a primeira a voltar.
  const fila = [...ordenarParaQuitar(pagas.map((x) => ({ ...x, tipo: x.p.tipo, vencimento: x.p.vencimento, numero: x.p.numero })))].reverse();
  let falta = alvo;
  for (const x of fila) {
    if (falta <= 0) break;
    const parte = Math.min(falta, x.s.pagoCents);
    await db.pagamento.create({
      data: {
        orderId: conta.orderId,
        contaId: conta.id,
        parcelaId: x.p.id,
        valorCents: -parte,
        meio: x.s.meio ? (x.s.meio as PaymentMethod) : undefined,
        recebidoEm: input.recebidoEm ?? new Date(),
        observacao: input.observacao?.trim() || "Estorno",
        createdById: input.userId,
      },
    });
    falta -= parte;
  }
  const saldo = await sincronizarConta(db, conta.id);
  return { saldoDepois: saldo.saldoCents };
}

/**
 * Devolve o dinheiro de uma parcela paga e a encerra (status "Reembolso").
 * Só em conta avulsa: numa conta de pedido a dívida continua existindo, e o
 * caminho certo é o estorno.
 */
export async function reembolsarParcela(db: Db, input: { tenantId: string; parcelaId: string; observacao?: string | null; userId?: string }) {
  const parcela = await db.parcela.findFirst({
    where: { id: input.parcelaId, tenantId: input.tenantId },
    include: { pagamentos: true, conta: { select: { id: true, orderId: true, canceladaEm: true } } },
  });
  if (!parcela) throw new ErroDeConta("parcela não encontrada", 404);
  if (parcela.conta.orderId) throw new ErroDeConta("numa conta de pedido, use o estorno: a dívida continua valendo");
  const s = situacao(parcela);
  if (s.pagoCents <= 0) throw new ErroDeConta("só parcela com recebimento pode ser reembolsada");
  if (parcela.reembolsadaEm) throw new ErroDeConta("parcela já reembolsada", 409);

  await db.pagamento.create({
    data: {
      orderId: null,
      contaId: parcela.conta.id,
      parcelaId: parcela.id,
      valorCents: -s.pagoCents,
      meio: s.meio ? (s.meio as PaymentMethod) : undefined,
      observacao: input.observacao?.trim() || "Reembolso",
      createdById: input.userId,
    },
  });
  await db.parcela.update({ where: { id: parcela.id }, data: { reembolsadaEm: new Date() } });
  return { ok: true };
}

/* --------------------------------------------------------- edição e cancelamento */

export async function editarParcela(
  db: Db,
  input: { tenantId: string; parcelaId: string; vencimento?: Date | null; valorCents?: number; observacao?: string | null }
) {
  const parcela = await db.parcela.findFirst({
    where: { id: input.parcelaId, tenantId: input.tenantId },
    include: { pagamentos: true, conta: { select: { id: true, orderId: true, canceladaEm: true } } },
  });
  if (!parcela) throw new ErroDeConta("parcela não encontrada", 404);
  if (parcela.conta.canceladaEm || parcela.canceladaEm) throw new ErroDeConta("parcela cancelada", 409);

  const data: Prisma.ParcelaUpdateInput = {};
  if (input.vencimento !== undefined) data.vencimento = input.vencimento ? diaAoMeioDia(input.vencimento) : null;
  if (input.observacao !== undefined) data.observacao = input.observacao?.trim() || null;

  if (input.valorCents !== undefined && input.valorCents !== parcela.valorCents) {
    // Numa conta de pedido o total é o do pedido: mexer no valor de uma parcela
    // faria a conta discordar dele. O caminho é reparcelar.
    if (parcela.conta.orderId) throw new ErroDeConta("o valor das parcelas de um pedido muda ao reparcelar");
    if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) throw new ErroDeConta("valor inválido");
    const pago = situacao(parcela).pagoCents;
    if (input.valorCents < pago) throw new ErroDeConta("o valor não pode ficar abaixo do que já foi recebido");
    data.valorCents = input.valorCents;
  }

  await db.parcela.update({ where: { id: parcela.id }, data });
  if (parcela.conta.orderId) await sincronizarConta(db, parcela.conta.id);
  return { ok: true };
}

export async function cancelarParcela(db: Db, input: { tenantId: string; parcelaId: string }) {
  const parcela = await db.parcela.findFirst({
    where: { id: input.parcelaId, tenantId: input.tenantId },
    include: { pagamentos: true, conta: { select: { orderId: true } } },
  });
  if (!parcela) throw new ErroDeConta("parcela não encontrada", 404);
  if (parcela.conta.orderId) throw new ErroDeConta("parcela de pedido não se cancela aqui: reparcele ou cancele o pedido");
  if (situacao(parcela).pagoCents > 0) throw new ErroDeConta("parcela com recebimento: estorne ou reembolse antes de cancelar");
  await db.parcela.update({ where: { id: parcela.id }, data: { canceladaEm: new Date() } });
  return { ok: true };
}

export async function cancelarConta(db: Db, input: { tenantId: string; contaId: string }) {
  const conta = await db.contaReceber.findFirst({
    where: { id: input.contaId, tenantId: input.tenantId },
    include: { parcelas: { include: { pagamentos: true } } },
  });
  if (!conta) throw new ErroDeConta("conta não encontrada", 404);
  if (conta.orderId) throw new ErroDeConta("conta de pedido: cancele o pedido");
  if (conta.parcelas.some((p) => situacao(p).pagoCents > 0)) {
    throw new ErroDeConta("a conta tem recebimentos: estorne ou reembolse antes de cancelar");
  }
  const agora = new Date();
  await db.parcela.updateMany({ where: { contaId: conta.id, canceladaEm: null }, data: { canceladaEm: agora } });
  await db.contaReceber.update({ where: { id: conta.id }, data: { canceladaEm: agora } });
  return { ok: true };
}

/**
 * Refaz as parcelas que AINDA NÃO TIVERAM recebimento, com um plano novo para o
 * mesmo valor. As já pagas ou em pagamento ficam como estão. Serve para
 * "combinamos de pagar em 4 semanais em vez de 2 quinzenais".
 */
export async function reparcelarConta(
  db: Db,
  input: { tenantId: string; contaId: string; entradaCents?: number; numParcelas: number; periodicidade: PlanoDeParcelas["periodicidade"]; primeiroVencimento: Date; vencimentoEntrada?: Date }
) {
  const conta = await carregarConta(db, input.tenantId, input.contaId);
  const intocadas = conta.parcelas.filter((p) => !p.canceladaEm && !p.reembolsadaEm && situacao(p).pagoCents === 0);
  const total = intocadas.reduce((s, p) => s + p.valorCents, 0);
  if (intocadas.length === 0 || total <= 0) throw new ErroDeConta("não há parcelas sem recebimento para reparcelar");

  let novas;
  try {
    novas = gerarParcelas({
      totalCents: total,
      entradaCents: input.entradaCents,
      vencimentoEntrada: input.vencimentoEntrada,
      numParcelas: input.numParcelas,
      periodicidade: input.periodicidade,
      primeiroVencimento: input.primeiroVencimento,
    });
  } catch (e) {
    throw new ErroDeConta((e as Error).message);
  }

  await db.parcela.deleteMany({ where: { id: { in: intocadas.map((p) => p.id) } } });
  await db.parcela.createMany({
    data: novas.map((p) => ({
      contaId: conta.id,
      tenantId: input.tenantId,
      numero: p.numero,
      totalParcelas: p.totalParcelas,
      tipo: p.tipo as TipoParcela,
      vencimento: p.vencimento,
      valorCents: p.valorCents,
    })),
  });
  if (conta.orderId) await sincronizarConta(db, conta.id);
  return { parcelas: novas.length };
}

/* ------------------------------------------------------------- sincronização */

/**
 * Refaz o que depende do dinheiro e das parcelas: o saldo da conta e, quando
 * ela veio de um pedido, o cache do pedido (`pago`, `pagoEm`, `vencimento`).
 */
export async function sincronizarConta(db: Db, contaId: string) {
  const conta = await db.contaReceber.findUniqueOrThrow({
    where: { id: contaId },
    include: { parcelas: { include: { pagamentos: true } } },
  });

  const vivas = conta.parcelas.filter((p) => !p.canceladaEm && !p.reembolsadaEm);
  const situacoes = vivas.map((p) => ({ p, s: situacao(p) }));
  const saldoCents = situacoes.reduce((s, x) => s + x.s.saldoCents, 0);

  if (conta.orderId) {
    const pedido = await db.order.findUniqueOrThrow({
      where: { id: conta.orderId },
      select: { id: true, pagamentos: { select: { valorCents: true, recebidoEm: true } }, totalCents: true },
    });
    const recebido = pedido.pagamentos.reduce((s, x) => s + x.valorCents, 0);
    const quitado = pedido.totalCents - recebido <= 0;
    const ultimo = [...pedido.pagamentos].sort((a, b) => b.recebidoEm.getTime() - a.recebidoEm.getTime())[0];

    // O vencimento do pedido é o da próxima parcela em aberto: é a data que o
    // acompanhamento interno (worker) e as telas antigas leem.
    const proxima = situacoes
      .filter((x) => x.s.status === "PENDENTE" && x.p.vencimento)
      .sort((a, b) => a.p.vencimento!.getTime() - b.p.vencimento!.getTime())[0];

    await db.order.update({
      where: { id: pedido.id },
      data: {
        pago: quitado,
        pagoEm: quitado ? (ultimo?.recebidoEm ?? new Date()) : null,
        vencimento: quitado ? null : (proxima?.p.vencimento ?? null),
      },
    });
  }

  return { saldoCents };
}

/* -------------------------------------------------------------------- leitura */

export type FiltrosDeContas = {
  desde?: Date;
  ate?: Date;
  /** Qual data o período filtra. */
  tipoData: "vencimento" | "pagamento";
  cliente?: string;
  status: StatusParcela[];
  tipo?: TipoParcela;
};

export type LinhaDeParcela = {
  id: string;
  contaId: string;
  orderId: string | null;
  pedidoNumero: number | null;
  conversationId: string | null;
  origem: "MANUAL" | "PEDIDO";
  descricao: string | null;
  contato: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
  vencimento: Date | null;
  pagaEm: Date | null;
  tipo: TipoParcela;
  numero: number;
  totalParcelas: number;
  status: StatusParcela;
  valorCents: number;
  pagoCents: number;
  saldoCents: number;
  meio: string | null;
  faixa: ReturnType<typeof faixaDeVencimento> | null;
  diasAtraso: number;
  precisaAtencaoHoje: boolean;
};

export async function listarParcelas(tenantId: string, f: FiltrosDeContas, agora = new Date()) {
  const porVencimento = f.tipoData === "vencimento";
  const janela = (f.desde || f.ate) ? { ...(f.desde ? { gte: f.desde } : {}), ...(f.ate ? { lte: f.ate } : {}) } : undefined;

  const parcelas = await prisma.parcela.findMany({
    where: {
      tenantId,
      conta: { canceladaEm: null, ...(f.cliente ? { contact: { OR: [{ name: { contains: f.cliente, mode: "insensitive" } }, { phoneNumber: { contains: f.cliente.replace(/\D/g, "") || "__x__" } }] } } : {}) },
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(janela
        ? porVencimento
          ? { vencimento: janela }
          : { pagamentos: { some: { recebidoEm: janela, valorCents: { gt: 0 } } } }
        : {}),
    },
    include: {
      pagamentos: true,
      conta: {
        select: {
          id: true,
          origem: true,
          descricao: true,
          order: { select: { id: true, numero: true, conversationId: true } },
          contact: { select: { id: true, name: true, waJid: true, phoneNumber: true } },
        },
      },
    },
    orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: 1000,
  });

  const linhas: LinhaDeParcela[] = [];
  for (const p of parcelas) {
    const s = situacao(p);
    if (!f.status.includes(s.status)) continue;
    const pendente = s.status === "PENDENTE";
    const faixa = pendente ? faixaDeVencimento(p.vencimento, agora) : null;
    linhas.push({
      id: p.id,
      contaId: p.conta.id,
      orderId: p.conta.order?.id ?? null,
      pedidoNumero: p.conta.order?.numero ?? null,
      conversationId: p.conta.order?.conversationId ?? null,
      origem: p.conta.origem,
      descricao: p.conta.descricao,
      contato: p.conta.contact,
      vencimento: p.vencimento,
      pagaEm: s.pagaEm,
      tipo: p.tipo,
      numero: p.numero,
      totalParcelas: p.totalParcelas,
      status: s.status,
      valorCents: p.valorCents,
      pagoCents: s.pagoCents,
      saldoCents: s.saldoCents,
      meio: s.meio,
      faixa,
      diasAtraso: pendente && p.vencimento && faixa === "vencido" ? diasDeAtraso(p.vencimento, agora) : 0,
      precisaAtencaoHoje: pendente && p.vencimento ? precisaLembrarHoje(p.vencimento, agora) : false,
    });
  }
  return linhas;
}

/** Totais das parcelas em aberto, por faixa de atraso — os cartões do topo. */
export async function resumoDoAReceber(tenantId: string, agora = new Date()) {
  const abertas = await listarParcelas(tenantId, { tipoData: "vencimento", status: ["PENDENTE"] }, agora);
  const resumo = { vencido: 0, vence_hoje: 0, a_vencer: 0, sem_prazo: 0, total: 0 };
  for (const l of abertas) {
    if (!l.faixa) continue;
    resumo[l.faixa] += l.saldoCents;
    resumo.total += l.saldoCents;
  }
  return resumo;
}

export async function detalheDaConta(tenantId: string, contaId: string) {
  const conta = await prisma.contaReceber.findFirst({
    where: { id: contaId, tenantId },
    include: {
      contact: { select: { id: true, name: true, waJid: true, phoneNumber: true } },
      order: { select: { id: true, numero: true, conversationId: true, totalCents: true, paymentMethod: true } },
      parcelas: { include: { pagamentos: { orderBy: { recebidoEm: "asc" }, include: { createdBy: { select: { name: true } } } } }, orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { numero: "asc" }] },
    },
  });
  if (!conta) return null;

  const parcelas = ordenarParaQuitar(
    conta.parcelas.map((p) => ({ ...p, tipo: p.tipo, vencimento: p.vencimento, numero: p.numero }))
  ).map((p) => {
    const s = situacao(p);
    return {
      id: p.id,
      numero: p.numero,
      totalParcelas: p.totalParcelas,
      tipo: p.tipo,
      vencimento: p.vencimento,
      valorCents: p.valorCents,
      status: s.status,
      pagoCents: s.pagoCents,
      saldoCents: s.saldoCents,
      pagaEm: s.pagaEm,
      observacao: p.observacao,
      pagamentos: p.pagamentos.map((x) => ({
        id: x.id,
        valorCents: x.valorCents,
        meio: x.meio,
        recebidoEm: x.recebidoEm,
        observacao: x.observacao,
        por: x.createdBy?.name ?? null,
      })),
    };
  });

  return {
    id: conta.id,
    origem: conta.origem,
    descricao: conta.descricao,
    canceladaEm: conta.canceladaEm,
    createdAt: conta.createdAt,
    contato: conta.contact,
    pedido: conta.order,
    totalCents: parcelas.filter((p) => p.status !== "CANCELADA").reduce((s, p) => s + p.valorCents, 0),
    saldoCents: parcelas.reduce((s, p) => s + p.saldoCents, 0),
    parcelas,
  };
}
