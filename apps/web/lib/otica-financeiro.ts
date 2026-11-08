import { prisma, type PaymentMethod, type Prisma } from "@dilon-zap/db";
import { diaAoMeioDia, type Periodicidade } from "@dilon-zap/receivables";
import { categoriaDeVendas, garantirPlano } from "@/lib/categorias-financeiras";
import {
  ErroDeConta,
  cancelarConta,
  cancelarParcela,
  editarParcela,
  receberNaConta,
  reparcelarConta,
  type Db,
} from "@/lib/contas-receber";
import { numeroOS, primeiroNome, resumoFinanceiro, type ParcelaDaConta, type ResumoFinanceiro } from "@/lib/otica-regras";

/**
 * A OS da ótica no financeiro.
 *
 * A venda vira uma CONTA A RECEBER do Zap — a mesma do Financeiro —, com o
 * sinal como parcela de entrada (já recebida) e o saldo como parcela única que
 * vence na data de entrega. Assim a OS não tem um segundo caderno de dinheiro:
 *
 *   - o sinal e cada recebimento caem no Caixa do dia (que lê os recebimentos);
 *   - o saldo aparece em "A receber", com o lembrete de vencimento que já existe;
 *   - o crediário próprio é só parcelar o saldo (`parcelarSaldo`), com as
 *     telas de parcelas, atraso e cobrança que o Financeiro já tem.
 *
 * Tudo que mexe em dinheiro roda numa transação só: ou a OS e a conta ficam
 * certas juntas, ou nada muda.
 */

export const SELECT_PARCELAS = {
  id: true,
  numero: true,
  totalParcelas: true,
  tipo: true,
  vencimento: true,
  valorCents: true,
  canceladaEm: true,
  reembolsadaEm: true,
  pagamentos: { select: { valorCents: true, meio: true, recebidoEm: true } },
} satisfies Prisma.ParcelaSelect;

type ParcelaLida = Prisma.ParcelaGetPayload<{ select: typeof SELECT_PARCELAS }>;

export function resumoDasParcelas(parcelas: ParcelaLida[]): ResumoFinanceiro {
  return resumoFinanceiro(parcelas as ParcelaDaConta[]);
}

/** As parcelas como a tela mostra: pagas, em aberto, vencidas, canceladas. */
export function parcelasParaTela(parcelas: ParcelaLida[], agora = new Date()) {
  return [...parcelas]
    .sort((a, b) => (a.vencimento?.getTime() ?? 0) - (b.vencimento?.getTime() ?? 0) || a.numero - b.numero)
    .map((p) => {
      const pago = p.pagamentos.reduce((s, x) => s + x.valorCents, 0);
      const status = p.canceladaEm ? "CANCELADA" : p.reembolsadaEm ? "REEMBOLSADA" : pago >= p.valorCents ? "PAGA" : pago > 0 ? "PARCIAL" : "ABERTA";
      const vencida = (status === "ABERTA" || status === "PARCIAL") && !!p.vencimento && p.vencimento.getTime() < agora.getTime() - 12 * 3_600_000;
      return {
        id: p.id,
        tipo: p.tipo,
        numero: p.numero,
        totalParcelas: p.totalParcelas,
        vencimento: p.vencimento,
        valorCents: p.valorCents,
        pagoCents: pago,
        status,
        vencida,
      };
    });
}

export type NovaContaDaOS = {
  tenantId: string;
  ordemId: string;
  numero: number;
  contactId: string;
  nomeCliente: string | null;
  valorCents: number;
  sinalCents: number;
  meioDoSinal: PaymentMethod | null;
  /** Quando o cliente prometeu o saldo: o dia da entrega. */
  vencimentoDoSaldo: Date | null;
  userId?: string;
};

/**
 * Cria a conta da venda e já lança o sinal como recebido. Devolve null para OS
 * sem valor (orçamento ainda sem preço): não há o que cobrar.
 *
 * Chame DENTRO da transação que cria a OS, depois de `garantirPlano`.
 */
export async function criarContaDaOS(db: Db, i: NovaContaDaOS): Promise<string | null> {
  if (i.valorCents <= 0) return null;
  const sinal = Math.min(Math.max(i.sinalCents, 0), i.valorCents);
  if (sinal > 0 && !i.meioDoSinal) throw new ErroDeConta("diga como o sinal foi pago (dinheiro, Pix ou cartão)");
  const hoje = diaAoMeioDia(new Date());
  const entrega = i.vencimentoDoSaldo ? diaAoMeioDia(i.vencimentoDoSaldo) : hoje;

  // Sinal que cobre tudo = pagou à vista: uma parcela só, já quitada.
  const aVista = sinal >= i.valorCents;
  const parcelas = aVista
    ? [{ numero: 1, totalParcelas: 1, tipo: "UNICA" as const, vencimento: hoje, valorCents: i.valorCents }]
    : [
        ...(sinal > 0 ? [{ numero: 1, totalParcelas: 1, tipo: "ENTRADA" as const, vencimento: hoje, valorCents: sinal }] : []),
        { numero: 1, totalParcelas: 1, tipo: "UNICA" as const, vencimento: entrega, valorCents: i.valorCents - sinal },
      ];

  const conta = await db.contaReceber.create({
    data: {
      tenantId: i.tenantId,
      contactId: i.contactId,
      origem: "MANUAL",
      descricao: `OS ${numeroOS(i.numero)}${i.nomeCliente ? ` · ${primeiroNome(i.nomeCliente)}` : ""}`,
      categoriaId: await categoriaDeVendas(db, i.tenantId),
      createdById: i.userId,
      parcelas: { create: parcelas.map((p) => ({ ...p, tenantId: i.tenantId })) },
    },
    select: { id: true, parcelas: { select: { id: true, tipo: true } } },
  });

  if (sinal > 0) {
    const alvo = conta.parcelas.find((p) => (aVista ? p.tipo === "UNICA" : p.tipo === "ENTRADA"))!;
    await receberNaConta(db, {
      tenantId: i.tenantId,
      contaId: conta.id,
      parcelaId: alvo.id,
      valorCents: sinal,
      meio: i.meioDoSinal,
      observacao: `Sinal da OS ${numeroOS(i.numero)}`,
      userId: i.userId,
    });
  }
  await db.ordemServico.update({ where: { id: i.ordemId }, data: { contaId: conta.id } });
  return conta.id;
}

/** Prepara o que `criarContaDaOS` precisa fora da transação (o plano de categorias usa o prisma direto). */
export async function prepararFinanceiro(tenantId: string) {
  await garantirPlano(tenantId);
}

async function contaDaOS(db: Db, tenantId: string, ordemId: string) {
  const ordem = await db.ordemServico.findFirst({
    where: { id: ordemId, tenantId },
    select: { id: true, numero: true, etapa: true, valorCents: true, contaId: true },
  });
  if (!ordem) throw new ErroDeConta("OS não encontrada", 404);
  if (ordem.etapa === "CANCELADA") throw new ErroDeConta("OS cancelada", 409);
  if (!ordem.contaId) throw new ErroDeConta("esta OS não tem valor lançado: informe o valor antes", 409);
  return { ...ordem, contaId: ordem.contaId };
}

/** Recebe dinheiro da venda (saldo ou parte dele). Cai no Caixa e quita as parcelas mais antigas primeiro. */
export async function receberDaOS(input: { tenantId: string; ordemId: string; valorCents: number; meio: PaymentMethod; userId: string }) {
  return prisma.$transaction(async (tx) => {
    const os = await contaDaOS(tx, input.tenantId, input.ordemId);
    if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) throw new ErroDeConta("informe um valor maior que zero");
    return receberNaConta(tx, {
      tenantId: input.tenantId,
      contaId: os.contaId,
      valorCents: input.valorCents,
      meio: input.meio,
      observacao: `OS ${numeroOS(os.numero)}`,
      userId: input.userId,
    });
  });
}

/**
 * Crediário: divide o que ainda falta em parcelas. As que já receberam (o
 * sinal) não mudam. É o caminho de "o cliente vai pagar o saldo em 3 vezes".
 */
export async function parcelarSaldo(input: {
  tenantId: string;
  ordemId: string;
  numParcelas: number;
  periodicidade: Periodicidade;
  primeiroVencimento: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const os = await contaDaOS(tx, input.tenantId, input.ordemId);
    return reparcelarConta(tx, {
      tenantId: input.tenantId,
      contaId: os.contaId,
      numParcelas: input.numParcelas,
      periodicidade: input.periodicidade,
      primeiroVencimento: input.primeiroVencimento,
    });
  });
}

/**
 * Corrige o valor da venda. Só quando dá para fazer sem bagunçar o que já foi
 * combinado: a diferença vai para a ÚNICA parcela em aberto sem recebimento.
 * Já parcelada ou quitada, o ajuste é no Financeiro, parcela por parcela.
 */
export async function corrigirValor(input: { tenantId: string; ordemId: string; valorCents: number }) {
  return prisma.$transaction(async (tx) => {
    const os = await contaDaOS(tx, input.tenantId, input.ordemId);
    if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) throw new ErroDeConta("informe um valor maior que zero");
    const parcelas = await tx.parcela.findMany({ where: { contaId: os.contaId }, select: SELECT_PARCELAS });
    const vivas = parcelas.filter((p) => !p.canceladaEm && !p.reembolsadaEm);
    const semRecebimento = vivas.filter((p) => p.pagamentos.reduce((s, x) => s + x.valorCents, 0) === 0);
    const alvo = semRecebimento[0];
    if (semRecebimento.length !== 1 || !alvo) {
      throw new ErroDeConta("a venda já está parcelada ou quitada: ajuste as parcelas em Financeiro → A receber");
    }
    const outras = vivas.filter((p) => p.id !== alvo.id).reduce((s, p) => s + p.valorCents, 0);
    const novaParcela = input.valorCents - outras;
    if (novaParcela <= 0) throw new ErroDeConta("o valor não pode ficar abaixo do que já foi recebido");
    await editarParcela(tx, { tenantId: input.tenantId, parcelaId: alvo.id, valorCents: novaParcela });
    await tx.ordemServico.update({ where: { id: os.id }, data: { valorCents: input.valorCents } });
    return { ok: true };
  });
}

/**
 * Encerra o dinheiro de uma OS cancelada.
 *
 * `devolverSinal`: o que entrou é estornado (registrado, no Caixa) e a conta
 * é cancelada. Sem devolver, a loja fica com o que já recebeu — a OS do talão
 * diz que lente sob medida não tem cancelamento — e só o que ainda não entrou
 * deixa de ser cobrado.
 */
export async function encerrarConta(
  db: Db,
  input: { tenantId: string; contaId: string; devolverSinal: boolean; motivo?: string | null; userId?: string }
) {
  const parcelas = await db.parcela.findMany({ where: { contaId: input.contaId, tenantId: input.tenantId }, select: SELECT_PARCELAS });
  const recebido = resumoDasParcelas(parcelas).recebidoCents;
  if (recebido > 0 && !input.devolverSinal) {
    for (const p of parcelas) {
      const pago = p.pagamentos.reduce((s, x) => s + x.valorCents, 0);
      if (!p.canceladaEm && !p.reembolsadaEm && pago === 0) await cancelarParcela(db, { tenantId: input.tenantId, parcelaId: p.id });
    }
    return { devolvido: false };
  }
  await cancelarConta(db, { tenantId: input.tenantId, contaId: input.contaId, estornar: true, motivo: input.motivo, userId: input.userId });
  return { devolvido: recebido > 0 };
}

/** O resumo do dinheiro de uma OS, para a lista e o aviso ao cliente. */
export async function resumoDaOS(contaId: string | null): Promise<ResumoFinanceiro | null> {
  if (!contaId) return null;
  const parcelas = await prisma.parcela.findMany({ where: { contaId }, select: SELECT_PARCELAS });
  return resumoDasParcelas(parcelas);
}
