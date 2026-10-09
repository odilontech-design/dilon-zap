import { prisma } from "@dilon-zap/db";
import type { FormaPagamentoConta, Prisma } from "@prisma/client";
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
 * Contas a pagar: o espelho das contas a receber, do lado de quem deve.
 *
 * Mesmas duas regras do A receber: (1) o que se grava é o dinheiro que SAIU
 * (SaidaPagamento); a situação da parcela é sempre calculada dele; (2) todo
 * pagamento aponta para uma parcela — um pagamento maior que a parcela vira
 * uma linha por parcela quitada.
 *
 * A matemática (divisão em centavos, vencimentos, alocação) é a mesma e vem do
 * pacote @dilon-zap/receivables. Nas contas a pagar o "tipo de pagamento" da
 * lista é a FORMA (boleto, PIX...), e não a periodicidade.
 */

export type Db = Prisma.TransactionClient;

export class ErroDePagar extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type ParcelaComSaidas = Prisma.ParcelaPagarGetPayload<{ include: { pagamentos: true } }>;

function situacao(p: ParcelaComSaidas) {
  return situacaoDaParcela(
    { id: p.id, numero: p.numero, tipo: "UNICA", vencimento: p.vencimento, valorCents: p.valorCents, canceladaEm: p.canceladaEm, reembolsadaEm: p.reembolsadaEm },
    p.pagamentos.map((x) => ({ valorCents: x.valorCents, recebidoEm: x.pagoEm, meio: x.meio }))
  );
}

/* --------------------------------------------------------------- fornecedores */

export async function achaOuCriaFornecedor(db: Db, tenantId: string, ref: { id?: string | null; nome?: string | null }) {
  if (ref.id) {
    const f = await db.fornecedor.findFirst({ where: { id: ref.id, tenantId }, select: { id: true } });
    if (!f) throw new ErroDePagar("fornecedor não encontrado", 404);
    return f;
  }
  const nome = ref.nome?.trim();
  if (!nome) throw new ErroDePagar("informe o fornecedor");
  // O mesmo nome com outra caixa é o mesmo fornecedor: "MAXILINE" e "Maxiline"
  // somariam dois fornecedores na lista e dois totais.
  const existente = await db.fornecedor.findFirst({ where: { tenantId, nome: { equals: nome, mode: "insensitive" } }, select: { id: true } });
  if (existente) return existente;
  return db.fornecedor.create({ data: { tenantId, nome }, select: { id: true } });
}

/* ------------------------------------------------------------------- criação */

export type NovaContaPagarInput = {
  tenantId: string;
  fornecedorId?: string | null;
  fornecedorNome?: string | null;
  descricao?: string | null;
  forma: FormaPagamentoConta;
  plano: PlanoDeParcelas;
  userId?: string;
};

export async function criarContaPagar(db: Db, input: NovaContaPagarInput) {
  const fornecedor = await achaOuCriaFornecedor(db, input.tenantId, { id: input.fornecedorId, nome: input.fornecedorNome });

  let parcelas;
  try {
    parcelas = gerarParcelas(input.plano);
  } catch (e) {
    throw new ErroDePagar((e as Error).message);
  }

  return db.contaPagar.create({
    data: {
      tenantId: input.tenantId,
      fornecedorId: fornecedor.id,
      descricao: input.descricao?.trim() || null,
      createdById: input.userId,
      parcelas: {
        create: parcelas.map((p) => ({
          tenantId: input.tenantId,
          numero: p.numero,
          totalParcelas: p.totalParcelas,
          forma: input.forma,
          vencimento: p.vencimento,
          valorCents: p.valorCents,
        })),
      },
    },
    select: { id: true },
  });
}

/* --------------------------------------------------------------- pagamentos */

async function carregar(db: Db, tenantId: string, contaId: string) {
  const conta = await db.contaPagar.findFirst({ where: { id: contaId, tenantId }, include: { parcelas: { include: { pagamentos: true } } } });
  if (!conta) throw new ErroDePagar("conta não encontrada", 404);
  if (conta.canceladaEm) throw new ErroDePagar("conta cancelada", 409);
  return conta;
}

export async function pagarNaConta(
  db: Db,
  input: { tenantId: string; contaId: string; valorCents: number; parcelaId?: string | null; meio?: FormaPagamentoConta | null; pagoEm?: Date; observacao?: string | null; userId?: string }
) {
  const conta = await carregar(db, input.tenantId, input.contaId);

  const abertas = conta.parcelas
    .map((p) => ({ p, s: situacao(p) }))
    .filter((x) => x.s.status === "PENDENTE")
    .map((x) => ({ id: x.p.id, tipo: "UNICA" as const, vencimento: x.p.vencimento, numero: x.p.numero, saldoCents: x.s.saldoCents }));

  let aloc;
  try {
    aloc = alocarRecebimento(abertas, input.valorCents, input.parcelaId);
  } catch (e) {
    // A mensagem do pacote fala em "saldo devedor", que aqui é "saldo a pagar".
    throw new ErroDePagar((e as Error).message.replace("saldo devedor", "saldo a pagar"));
  }

  const pagoEm = input.pagoEm ?? new Date();
  for (const a of aloc) {
    await db.saidaPagamento.create({
      data: {
        tenantId: input.tenantId,
        contaId: conta.id,
        parcelaId: a.parcelaId,
        valorCents: a.valorCents,
        meio: input.meio ?? undefined,
        pagoEm,
        observacao: input.observacao?.trim() || null,
        createdById: input.userId,
      },
    });
  }
  return { parcelasAtingidas: aloc.length };
}

/** Desfaz pagamentos (o valor volta a ser dívida). Estorno é um pagamento NEGATIVO. */
export async function estornarPagamento(
  db: Db,
  input: { tenantId: string; contaId: string; parcelaId?: string | null; valorCents?: number; observacao?: string | null; userId?: string }
) {
  const conta = await carregar(db, input.tenantId, input.contaId);
  const pagas = conta.parcelas
    .map((p) => ({ p, s: situacao(p) }))
    .filter((x) => x.s.pagoCents > 0 && !x.p.canceladaEm && !x.p.reembolsadaEm)
    .filter((x) => !input.parcelaId || x.p.id === input.parcelaId);

  const disponivel = pagas.reduce((s, x) => s + x.s.pagoCents, 0);
  const alvo = input.valorCents ?? disponivel;
  if (alvo <= 0 || alvo > disponivel) throw new ErroDePagar(`não há tanto pago para estornar (pago: ${(disponivel / 100).toFixed(2)})`);

  const fila = [...ordenarParaQuitar(pagas.map((x) => ({ ...x, tipo: "UNICA" as const, vencimento: x.p.vencimento, numero: x.p.numero })))].reverse();
  let falta = alvo;
  for (const x of fila) {
    if (falta <= 0) break;
    const parte = Math.min(falta, x.s.pagoCents);
    await db.saidaPagamento.create({
      data: {
        tenantId: input.tenantId,
        contaId: conta.id,
        parcelaId: x.p.id,
        valorCents: -parte,
        meio: (x.s.meio as FormaPagamentoConta | null) ?? undefined,
        observacao: input.observacao?.trim() || "Estorno",
        createdById: input.userId,
      },
    });
    falta -= parte;
  }
  return { ok: true };
}

/** O fornecedor devolveu o dinheiro de uma parcela já paga: ela é encerrada como "Reembolso". */
export async function reembolsarParcelaPagar(db: Db, input: { tenantId: string; parcelaId: string; observacao?: string | null; userId?: string }) {
  const parcela = await db.parcelaPagar.findFirst({ where: { id: input.parcelaId, tenantId: input.tenantId }, include: { pagamentos: true } });
  if (!parcela) throw new ErroDePagar("parcela não encontrada", 404);
  if (parcela.reembolsadaEm) throw new ErroDePagar("parcela já reembolsada", 409);
  const s = situacao(parcela);
  if (s.pagoCents <= 0) throw new ErroDePagar("só parcela paga pode ser reembolsada");

  await db.saidaPagamento.create({
    data: {
      tenantId: input.tenantId,
      contaId: parcela.contaId,
      parcelaId: parcela.id,
      valorCents: -s.pagoCents,
      meio: (s.meio as FormaPagamentoConta | null) ?? undefined,
      observacao: input.observacao?.trim() || "Reembolso do fornecedor",
      createdById: input.userId,
    },
  });
  await db.parcelaPagar.update({ where: { id: parcela.id }, data: { reembolsadaEm: new Date() } });
  return { ok: true };
}

/* ----------------------------------------------------------- edição / cancelar */

export async function editarParcelaPagar(
  db: Db,
  input: { tenantId: string; parcelaId: string; vencimento?: Date | null; valorCents?: number; forma?: FormaPagamentoConta; observacao?: string | null }
) {
  const parcela = await db.parcelaPagar.findFirst({ where: { id: input.parcelaId, tenantId: input.tenantId }, include: { pagamentos: true, conta: { select: { canceladaEm: true } } } });
  if (!parcela) throw new ErroDePagar("parcela não encontrada", 404);
  if (parcela.canceladaEm || parcela.conta.canceladaEm) throw new ErroDePagar("parcela cancelada", 409);

  const data: Prisma.ParcelaPagarUpdateInput = {};
  if (input.vencimento !== undefined) data.vencimento = input.vencimento ? diaAoMeioDia(input.vencimento) : null;
  if (input.forma !== undefined) data.forma = input.forma;
  if (input.observacao !== undefined) data.observacao = input.observacao?.trim() || null;
  if (input.valorCents !== undefined && input.valorCents !== parcela.valorCents) {
    if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) throw new ErroDePagar("valor inválido");
    if (input.valorCents < situacao(parcela).pagoCents) throw new ErroDePagar("o valor não pode ficar abaixo do que já foi pago");
    data.valorCents = input.valorCents;
  }
  await db.parcelaPagar.update({ where: { id: parcela.id }, data });
  return { ok: true };
}

export async function cancelarParcelaPagar(db: Db, input: { tenantId: string; parcelaId: string }) {
  const parcela = await db.parcelaPagar.findFirst({ where: { id: input.parcelaId, tenantId: input.tenantId }, include: { pagamentos: true } });
  if (!parcela) throw new ErroDePagar("parcela não encontrada", 404);
  if (situacao(parcela).pagoCents > 0) throw new ErroDePagar("parcela com pagamento: estorne antes de cancelar");
  await db.parcelaPagar.update({ where: { id: parcela.id }, data: { canceladaEm: new Date() } });
  return { ok: true };
}

export async function cancelarContaPagar(db: Db, input: { tenantId: string; contaId: string }) {
  const conta = await db.contaPagar.findFirst({ where: { id: input.contaId, tenantId: input.tenantId }, include: { parcelas: { include: { pagamentos: true } } } });
  if (!conta) throw new ErroDePagar("conta não encontrada", 404);
  if (conta.parcelas.some((p) => situacao(p).pagoCents > 0)) throw new ErroDePagar("a conta tem pagamentos: estorne antes de cancelar");
  const agora = new Date();
  await db.parcelaPagar.updateMany({ where: { contaId: conta.id, canceladaEm: null }, data: { canceladaEm: agora } });
  await db.contaPagar.update({ where: { id: conta.id }, data: { canceladaEm: agora } });
  return { ok: true };
}

export async function reparcelarContaPagar(
  db: Db,
  input: { tenantId: string; contaId: string; numParcelas: number; periodicidade: PlanoDeParcelas["periodicidade"]; primeiroVencimento: Date }
) {
  const conta = await carregar(db, input.tenantId, input.contaId);
  const intocadas = conta.parcelas.filter((p) => !p.canceladaEm && !p.reembolsadaEm && situacao(p).pagoCents === 0);
  const total = intocadas.reduce((s, p) => s + p.valorCents, 0);
  if (intocadas.length === 0 || total <= 0) throw new ErroDePagar("não há parcelas sem pagamento para reparcelar");

  let novas;
  try {
    novas = gerarParcelas({ totalCents: total, numParcelas: input.numParcelas, periodicidade: input.periodicidade, primeiroVencimento: input.primeiroVencimento });
  } catch (e) {
    throw new ErroDePagar((e as Error).message);
  }
  const forma = intocadas[0].forma;
  await db.parcelaPagar.deleteMany({ where: { id: { in: intocadas.map((p) => p.id) } } });
  await db.parcelaPagar.createMany({
    data: novas.map((p) => ({ tenantId: input.tenantId, contaId: conta.id, numero: p.numero, totalParcelas: p.totalParcelas, forma, vencimento: p.vencimento, valorCents: p.valorCents })),
  });
  return { parcelas: novas.length };
}

/* -------------------------------------------------------------------- leitura */

export type FiltrosDePagar = {
  desde?: Date;
  ate?: Date;
  tipoData: "vencimento" | "pagamento";
  fornecedor?: string;
  fornecedorId?: string;
  status: StatusParcela[];
  forma?: FormaPagamentoConta;
};

export type LinhaPagar = {
  id: string;
  contaId: string;
  descricao: string | null;
  fornecedor: { id: string; nome: string };
  vencimento: Date | null;
  pagoEm: Date | null;
  forma: FormaPagamentoConta;
  numero: number;
  totalParcelas: number;
  status: StatusParcela;
  valorCents: number;
  pagoCents: number;
  saldoCents: number;
  faixa: ReturnType<typeof faixaDeVencimento> | null;
  diasAtraso: number;
  precisaAtencaoHoje: boolean;
};

export async function listarParcelasPagar(tenantId: string, f: FiltrosDePagar, agora = new Date()): Promise<LinhaPagar[]> {
  const janela = f.desde || f.ate ? { ...(f.desde ? { gte: f.desde } : {}), ...(f.ate ? { lte: f.ate } : {}) } : undefined;
  const parcelas = await prisma.parcelaPagar.findMany({
    where: {
      tenantId,
      conta: {
        canceladaEm: null,
        ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
        ...(f.fornecedor ? { fornecedor: { nome: { contains: f.fornecedor, mode: "insensitive" } } } : {}),
      },
      ...(f.forma ? { forma: f.forma } : {}),
      ...(janela ? (f.tipoData === "vencimento" ? { vencimento: janela } : { pagamentos: { some: { pagoEm: janela, valorCents: { gt: 0 } } } }) : {}),
    },
    include: { pagamentos: true, conta: { select: { id: true, descricao: true, fornecedor: { select: { id: true, nome: true } } } } },
    orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: 1000,
  });

  const linhas: LinhaPagar[] = [];
  for (const p of parcelas) {
    const s = situacao(p);
    if (!f.status.includes(s.status)) continue;
    const pendente = s.status === "PENDENTE";
    const faixa = pendente ? faixaDeVencimento(p.vencimento, agora) : null;
    linhas.push({
      id: p.id,
      contaId: p.conta.id,
      descricao: p.conta.descricao,
      fornecedor: p.conta.fornecedor,
      vencimento: p.vencimento,
      pagoEm: s.pagaEm,
      forma: p.forma,
      numero: p.numero,
      totalParcelas: p.totalParcelas,
      status: s.status,
      valorCents: p.valorCents,
      pagoCents: s.pagoCents,
      saldoCents: s.saldoCents,
      faixa,
      diasAtraso: pendente && p.vencimento && faixa === "vencido" ? diasDeAtraso(p.vencimento, agora) : 0,
      precisaAtencaoHoje: pendente && p.vencimento ? precisaLembrarHoje(p.vencimento, agora) : false,
    });
  }
  return linhas;
}

export async function resumoAPagar(tenantId: string, agora = new Date()) {
  const abertas = await listarParcelasPagar(tenantId, { tipoData: "vencimento", status: ["PENDENTE"] }, agora);
  const resumo = { vencido: 0, vence_hoje: 0, a_vencer: 0, sem_prazo: 0, total: 0 };
  for (const l of abertas) {
    if (!l.faixa) continue;
    resumo[l.faixa] += l.saldoCents;
    resumo.total += l.saldoCents;
  }
  return resumo;
}

export async function detalheDaContaPagar(tenantId: string, contaId: string) {
  const conta = await prisma.contaPagar.findFirst({
    where: { id: contaId, tenantId },
    include: {
      fornecedor: { select: { id: true, nome: true, telefone: true } },
      parcelas: { include: { pagamentos: { orderBy: { pagoEm: "asc" }, include: { createdBy: { select: { name: true } } } } } },
    },
  });
  if (!conta) return null;

  const parcelas = ordenarParaQuitar(conta.parcelas.map((p) => ({ ...p, tipo: "UNICA" as const }))).map((p) => {
    const s = situacao(p);
    return {
      id: p.id,
      numero: p.numero,
      totalParcelas: p.totalParcelas,
      forma: p.forma,
      vencimento: p.vencimento,
      valorCents: p.valorCents,
      status: s.status,
      pagoCents: s.pagoCents,
      saldoCents: s.saldoCents,
      pagoEm: s.pagaEm,
      observacao: p.observacao,
      pagamentos: p.pagamentos.map((x) => ({ id: x.id, valorCents: x.valorCents, meio: x.meio, pagoEm: x.pagoEm, observacao: x.observacao, por: x.createdBy?.name ?? null })),
    };
  });

  return {
    id: conta.id,
    descricao: conta.descricao,
    canceladaEm: conta.canceladaEm,
    createdAt: conta.createdAt,
    fornecedor: conta.fornecedor,
    totalCents: parcelas.filter((p) => p.status !== "CANCELADA").reduce((s, p) => s + p.valorCents, 0),
    saldoCents: parcelas.reduce((s, p) => s + p.saldoCents, 0),
    parcelas,
  };
}
