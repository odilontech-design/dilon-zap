import { prisma } from "@dilon-zap/db";
import type { Prisma, TipoMovimentoCaixa } from "@prisma/client";
import { resumoDoCaixa } from "@dilon-zap/receivables";

/**
 * Controle de caixa.
 *
 * O caixa NÃO guarda uma cópia dos recebimentos. O que entrou durante uma
 * sessão é o que foi lançado (Pagamento.createdAt) entre a abertura e o
 * fechamento — assim o caixa não tem como discordar do extrato, e um
 * recebimento lançado por qualquer tela (pedido, conta avulsa, fechamento de
 * pedido pago na hora) cai nele sem ninguém lembrar de "mandar para o caixa".
 *
 * Usa a data do LANÇAMENTO e não a de `recebidoEm`: o dinheiro recebido no
 * sábado e lançado na segunda estava na gaveta na segunda, não no sábado.
 *
 * Só o dinheiro é conferido na gaveta. PIX, cartão e boleto aparecem no total
 * da sessão, mas não entram na conta da diferença.
 */

export class ErroDeCaixa extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function caixaAberto(tenantId: string) {
  return prisma.caixa.findFirst({ where: { tenantId, fechadoEm: null }, orderBy: { abertoEm: "desc" } });
}

export async function abrirCaixa(tenantId: string, userId: string, valorInicialCents: number) {
  if (!Number.isInteger(valorInicialCents) || valorInicialCents < 0) throw new ErroDeCaixa("valor inicial inválido");
  return prisma.$transaction(async (tx) => {
    const aberto = await tx.caixa.findFirst({ where: { tenantId, fechadoEm: null }, select: { id: true } });
    if (aberto) throw new ErroDeCaixa("já existe um caixa aberto: feche-o antes de abrir outro", 409);
    return tx.caixa.create({ data: { tenantId, abertoPorId: userId, valorInicialCents }, select: { id: true } });
  });
}

type Cx = Prisma.CaixaGetPayload<{ include: { abertoPor: { select: { name: true } }; fechadoPor: { select: { name: true } } } }>;

async function recebimentosDaSessao(tenantId: string, caixa: Pick<Cx, "abertoEm" | "fechadoEm">) {
  return prisma.pagamento.findMany({
    where: {
      OR: [{ order: { tenantId } }, { conta: { tenantId } }],
      createdAt: { gte: caixa.abertoEm, ...(caixa.fechadoEm ? { lte: caixa.fechadoEm } : {}) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      valorCents: true,
      meio: true,
      recebidoEm: true,
      createdAt: true,
      observacao: true,
      createdBy: { select: { name: true } },
      order: { select: { numero: true, contact: { select: { name: true, phoneNumber: true } } } },
      conta: { select: { descricao: true, contact: { select: { name: true, phoneNumber: true } } } },
      parcela: { select: { numero: true, totalParcelas: true, tipo: true } },
    },
  });
}

/** Tudo de uma sessão de caixa: dados, lançamentos e o resumo para conferir. */
export async function dadosDoCaixa(tenantId: string, caixaId: string) {
  const caixa = await prisma.caixa.findFirst({
    where: { id: caixaId, tenantId },
    include: { abertoPor: { select: { name: true } }, fechadoPor: { select: { name: true } } },
  });
  if (!caixa) return null;

  const [pagamentos, movimentos] = await Promise.all([
    recebimentosDaSessao(tenantId, caixa),
    prisma.movimentoCaixa.findMany({
      where: { caixaId: caixa.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, tipo: true, valorCents: true, descricao: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
  ]);

  const resumo = resumoDoCaixa({
    valorInicialCents: caixa.valorInicialCents,
    recebimentos: pagamentos.map((p) => ({ valorCents: p.valorCents, meio: p.meio })),
    movimentos: movimentos.map((m) => ({ tipo: m.tipo, valorCents: m.valorCents })),
  });

  return {
    caixa: {
      id: caixa.id,
      abertoEm: caixa.abertoEm,
      abertoPor: caixa.abertoPor?.name ?? null,
      valorInicialCents: caixa.valorInicialCents,
      fechadoEm: caixa.fechadoEm,
      fechadoPor: caixa.fechadoPor?.name ?? null,
      esperadoDinheiroCents: caixa.esperadoDinheiroCents,
      contadoDinheiroCents: caixa.contadoDinheiroCents,
      diferencaCents: caixa.diferencaCents,
      observacao: caixa.observacao,
    },
    resumo,
    recebimentos: pagamentos.map((p) => {
      const contato = p.order?.contact ?? p.conta?.contact ?? null;
      return {
        id: p.id,
        valorCents: p.valorCents,
        meio: p.meio,
        lancadoEm: p.createdAt,
        recebidoEm: p.recebidoEm,
        cliente: contato?.name ?? contato?.phoneNumber ?? "—",
        referencia: p.order ? `Pedido #${p.order.numero}` : (p.conta?.descricao ?? "Conta avulsa"),
        parcela: p.parcela ? `${p.parcela.numero} de ${p.parcela.totalParcelas}` : null,
        observacao: p.observacao,
        por: p.createdBy?.name ?? null,
      };
    }),
    movimentos,
  };
}

export async function registrarMovimento(
  tenantId: string,
  userId: string,
  caixaId: string,
  m: { tipo: TipoMovimentoCaixa; valorCents: number; descricao: string }
) {
  if (!Number.isInteger(m.valorCents) || m.valorCents <= 0) throw new ErroDeCaixa("o valor precisa ser maior que zero");
  if (!m.descricao.trim()) throw new ErroDeCaixa("descreva o movimento");
  const caixa = await prisma.caixa.findFirst({ where: { id: caixaId, tenantId }, select: { id: true, fechadoEm: true } });
  if (!caixa) throw new ErroDeCaixa("caixa não encontrado", 404);
  if (caixa.fechadoEm) throw new ErroDeCaixa("caixa já fechado", 409);

  return prisma.movimentoCaixa.create({
    data: { tenantId, caixaId, tipo: m.tipo, valorCents: m.valorCents, descricao: m.descricao.trim(), createdById: userId },
    select: { id: true },
  });
}

/**
 * Fecha o caixa e CONGELA o que o sistema esperava, o que foi contado e a
 * diferença. Congelar mantém o histórico fiel mesmo se um recebimento for
 * corrigido depois: a conferência de hoje continua sendo a de hoje.
 */
export async function fecharCaixa(
  tenantId: string,
  userId: string,
  caixaId: string,
  contadoDinheiroCents: number,
  observacao?: string | null
) {
  if (!Number.isInteger(contadoDinheiroCents) || contadoDinheiroCents < 0) throw new ErroDeCaixa("valor contado inválido");

  const antes = await prisma.caixa.findFirst({ where: { id: caixaId, tenantId }, select: { id: true, fechadoEm: true } });
  if (!antes) throw new ErroDeCaixa("caixa não encontrado", 404);
  if (antes.fechadoEm) throw new ErroDeCaixa("caixa já fechado", 409);

  const fechadoEm = new Date();
  // O resumo é calculado com o instante do fechamento já como limite, para o
  // que for lançado depois não entrar na conta.
  const dados = await dadosDoCaixaAte(tenantId, caixaId, fechadoEm);
  const esperado = dados.resumo.esperadoDinheiroCents;

  await prisma.caixa.update({
    where: { id: caixaId },
    data: {
      fechadoEm,
      fechadoPorId: userId,
      esperadoDinheiroCents: esperado,
      contadoDinheiroCents,
      diferencaCents: contadoDinheiroCents - esperado,
      observacao: observacao?.trim() || null,
    },
  });
  return { esperadoDinheiroCents: esperado, contadoDinheiroCents, diferencaCents: contadoDinheiroCents - esperado };
}

async function dadosDoCaixaAte(tenantId: string, caixaId: string, ate: Date) {
  const caixa = await prisma.caixa.findFirstOrThrow({ where: { id: caixaId, tenantId } });
  const [pagamentos, movimentos] = await Promise.all([
    recebimentosDaSessao(tenantId, { abertoEm: caixa.abertoEm, fechadoEm: ate }),
    prisma.movimentoCaixa.findMany({ where: { caixaId }, select: { tipo: true, valorCents: true } }),
  ]);
  return {
    resumo: resumoDoCaixa({
      valorInicialCents: caixa.valorInicialCents,
      recebimentos: pagamentos.map((p) => ({ valorCents: p.valorCents, meio: p.meio })),
      movimentos,
    }),
  };
}

/** Sessões anteriores, da mais recente para a mais antiga. */
export async function historicoDeCaixas(tenantId: string, limite = 30) {
  const caixas = await prisma.caixa.findMany({
    where: { tenantId, fechadoEm: { not: null } },
    orderBy: { abertoEm: "desc" },
    take: limite,
    include: { abertoPor: { select: { name: true } }, fechadoPor: { select: { name: true } } },
  });
  return caixas.map((c) => ({
    id: c.id,
    abertoEm: c.abertoEm,
    fechadoEm: c.fechadoEm,
    abertoPor: c.abertoPor?.name ?? null,
    fechadoPor: c.fechadoPor?.name ?? null,
    valorInicialCents: c.valorInicialCents,
    esperadoDinheiroCents: c.esperadoDinheiroCents,
    contadoDinheiroCents: c.contadoDinheiroCents,
    diferencaCents: c.diferencaCents,
  }));
}
