import { prisma, type Prisma } from "@dilon-zap/db";
import { ErroDeConta, type Db } from "@/lib/contas-receber";
import type { ArmacaoLida } from "@/lib/otica-regras";
import { numeroOS } from "@/lib/otica-regras";

/**
 * Estoque de armações da ótica.
 *
 * Duas regras, as mesmas do estoque de produtos do Zap:
 *   1. O que se grava é o MOVIMENTO (entrada, saída por OS, estorno, ajuste).
 *   2. `Armacao.quantidade` é cache do saldo e só muda junto com um movimento,
 *      na mesma transação — nunca escrito por fora.
 *
 * A saída é atômica: o decremento só acontece se ainda há saldo, no próprio
 * UPDATE. Duas atendentes vendendo a mesma peça única ao mesmo tempo não
 * conseguem as duas — a segunda recebe "sem estoque".
 */

export class ErroDeArmacao extends ErroDeConta {}

const SELECT_LISTA = {
  id: true,
  codigo: true,
  descricao: true,
  marca: true,
  cor: true,
  material: true,
  medidas: true,
  custoCents: true,
  precoCents: true,
  quantidade: true,
  ativo: true,
} satisfies Prisma.ArmacaoSelect;

export async function listarArmacoes(tenantId: string, f: { q?: string; soDisponiveis?: boolean; limite?: number }) {
  const q = (f.q ?? "").trim();
  const where: Prisma.ArmacaoWhereInput = {
    tenantId,
    ...(f.soDisponiveis ? { ativo: true, quantidade: { gt: 0 } } : {}),
    ...(q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { descricao: { contains: q, mode: "insensitive" } },
            { marca: { contains: q, mode: "insensitive" } },
            { cor: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [itens, total, disponiveis] = await Promise.all([
    prisma.armacao.findMany({ where, orderBy: [{ ativo: "desc" }, { codigo: "asc" }], take: Math.min(f.limite ?? 100, 500), select: SELECT_LISTA }),
    prisma.armacao.count({ where: { tenantId } }),
    prisma.armacao.aggregate({ where: { tenantId, ativo: true, quantidade: { gt: 0 } }, _sum: { quantidade: true }, _count: true }),
  ]);
  return { itens, resumo: { cadastradas: total, modelosDisponiveis: disponiveis._count, pecasDisponiveis: disponiveis._sum.quantidade ?? 0 } };
}

type Dados = {
  codigo: string;
  descricao: string;
  marca?: string | null;
  cor?: string | null;
  material?: string | null;
  medidas?: string | null;
  custoCents?: number | null;
  precoCents?: number | null;
  quantidade?: number;
};

export async function criarArmacao(tenantId: string, d: Dados, userId?: string) {
  const codigo = d.codigo.trim();
  const existe = await prisma.armacao.findFirst({ where: { tenantId, codigo: { equals: codigo, mode: "insensitive" } }, select: { id: true } });
  if (existe) throw new ErroDeArmacao(`já existe uma armação com o código ${codigo}`, 409);
  const quantidade = d.quantidade ?? 1;
  return prisma.$transaction(async (tx) => {
    const a = await tx.armacao.create({
      data: {
        tenantId,
        codigo,
        descricao: d.descricao.trim(),
        marca: d.marca?.trim() || null,
        cor: d.cor?.trim() || null,
        material: d.material?.trim() || null,
        medidas: d.medidas?.trim() || null,
        custoCents: d.custoCents ?? null,
        precoCents: d.precoCents ?? null,
        quantidade,
      },
      select: SELECT_LISTA,
    });
    if (quantidade > 0) {
      await tx.movimentoArmacao.create({ data: { tenantId, armacaoId: a.id, tipo: "ENTRADA", quantidade, porId: userId, observacao: "Cadastro" } });
    }
    return a;
  });
}

/**
 * Importa uma lista já lida (lib/otica-regras: lerListaDeArmacoes). Código que
 * já existe é PULADO, não sobrescrito: reimportar a mesma planilha duas vezes
 * não pode duplicar estoque nem apagar o que a loja já corrigiu à mão.
 */
export async function importarArmacoes(tenantId: string, linhas: ArmacaoLida[], userId: string, simular: boolean) {
  const codigos = linhas.map((l) => l.codigo);
  const existentes = await prisma.armacao.findMany({
    where: { tenantId, codigo: { in: codigos, mode: "insensitive" } },
    select: { codigo: true },
  });
  const jaTem = new Set(existentes.map((e) => e.codigo.toLowerCase()));
  const novas = linhas.filter((l) => !jaTem.has(l.codigo.toLowerCase()));
  const puladas = linhas.filter((l) => jaTem.has(l.codigo.toLowerCase())).map((l) => l.codigo);
  if (simular) return { criadas: novas.length, puladas, simulado: true };

  await prisma.$transaction(async (tx) => {
    await tx.armacao.createMany({
      data: novas.map((l) => ({
        tenantId,
        codigo: l.codigo,
        descricao: l.descricao,
        marca: l.marca,
        cor: l.cor,
        material: l.material,
        medidas: l.medidas,
        custoCents: l.custoCents,
        precoCents: l.precoCents,
        quantidade: l.quantidade,
      })),
      skipDuplicates: true,
    });
    const criadas = await tx.armacao.findMany({
      where: { tenantId, codigo: { in: novas.map((n) => n.codigo) } },
      select: { id: true, codigo: true, quantidade: true },
    });
    await tx.movimentoArmacao.createMany({
      data: criadas.filter((c) => c.quantidade > 0).map((c) => ({ tenantId, armacaoId: c.id, tipo: "ENTRADA" as const, quantidade: c.quantidade, porId: userId, observacao: "Importação da planilha" })),
    });
  });
  return { criadas: novas.length, puladas, simulado: false };
}

export async function editarArmacao(tenantId: string, id: string, d: Partial<Dados> & { ativo?: boolean }) {
  const atual = await prisma.armacao.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!atual) throw new ErroDeArmacao("armação não encontrada", 404);
  if (d.codigo !== undefined) {
    const outro = await prisma.armacao.findFirst({ where: { tenantId, codigo: { equals: d.codigo.trim(), mode: "insensitive" }, id: { not: id } }, select: { id: true } });
    if (outro) throw new ErroDeArmacao(`já existe uma armação com o código ${d.codigo.trim()}`, 409);
  }
  return prisma.armacao.update({
    where: { id },
    data: {
      codigo: d.codigo?.trim(),
      descricao: d.descricao?.trim(),
      marca: d.marca === undefined ? undefined : d.marca?.trim() || null,
      cor: d.cor === undefined ? undefined : d.cor?.trim() || null,
      material: d.material === undefined ? undefined : d.material?.trim() || null,
      medidas: d.medidas === undefined ? undefined : d.medidas?.trim() || null,
      custoCents: d.custoCents,
      precoCents: d.precoCents,
      ativo: d.ativo,
    },
    select: SELECT_LISTA,
  });
}

/** Contagem, quebra, perda: leva o saldo ao número contado e registra a diferença. */
export async function ajustarQuantidade(tenantId: string, id: string, novaQuantidade: number, motivo: string | null, userId: string) {
  if (!Number.isInteger(novaQuantidade) || novaQuantidade < 0 || novaQuantidade > 999) throw new ErroDeArmacao("quantidade inválida");
  return prisma.$transaction(async (tx) => {
    const a = await tx.armacao.findFirst({ where: { id, tenantId }, select: { id: true, quantidade: true } });
    if (!a) throw new ErroDeArmacao("armação não encontrada", 404);
    const diferenca = novaQuantidade - a.quantidade;
    if (diferenca === 0) return { quantidade: a.quantidade };
    await tx.armacao.update({ where: { id }, data: { quantidade: novaQuantidade } });
    await tx.movimentoArmacao.create({ data: { tenantId, armacaoId: id, tipo: "AJUSTE", quantidade: diferenca, porId: userId, observacao: motivo?.trim() || "Ajuste de contagem" } });
    return { quantidade: novaQuantidade };
  });
}

/** Vende uma peça numa OS. Falha se não há saldo — e a OS inteira falha junto (roda dentro da transação dela). */
export async function baixarParaOS(db: Db, i: { tenantId: string; armacaoId: string; ordemId: string; numeroOS: number; userId?: string }) {
  const r = await db.armacao.updateMany({
    where: { id: i.armacaoId, tenantId: i.tenantId, ativo: true, quantidade: { gte: 1 } },
    data: { quantidade: { decrement: 1 } },
  });
  if (r.count === 0) {
    const a = await db.armacao.findFirst({ where: { id: i.armacaoId, tenantId: i.tenantId }, select: { codigo: true, ativo: true } });
    if (!a) throw new ErroDeArmacao("armação não encontrada", 404);
    throw new ErroDeArmacao(a.ativo ? `a armação ${a.codigo} já foi vendida (sem estoque)` : `a armação ${a.codigo} está desativada`, 409);
  }
  await db.movimentoArmacao.create({
    data: { tenantId: i.tenantId, armacaoId: i.armacaoId, tipo: "SAIDA_OS", quantidade: -1, ordemId: i.ordemId, porId: i.userId, observacao: `OS ${numeroOS(i.numeroOS)}` },
  });
}

/** A armação volta ao estoque: OS cancelada ou armação trocada. */
export async function estornarDaOS(db: Db, i: { tenantId: string; armacaoId: string; ordemId: string; numeroOS: number; userId?: string; motivo: string }) {
  await db.armacao.update({ where: { id: i.armacaoId }, data: { quantidade: { increment: 1 } } });
  await db.movimentoArmacao.create({
    data: { tenantId: i.tenantId, armacaoId: i.armacaoId, tipo: "ESTORNO_OS", quantidade: 1, ordemId: i.ordemId, porId: i.userId, observacao: `OS ${numeroOS(i.numeroOS)} · ${i.motivo}` },
  });
}
