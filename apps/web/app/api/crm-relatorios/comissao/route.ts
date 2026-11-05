import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { comissaoPorConsultora, FAIXAS_PADRAO } from "@/lib/comissao";

function data(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Comissão por faixa de venda. A gestão vê toda a equipe; quem só atende vê
 * apenas a própria linha — o que as colegas vendem não é para ela.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const gestao = ehGerencia(user.role);
  const q = new URL(req.url).searchParams;
  const desde = data(q.get("desde"));
  const ate = data(q.get("ate"));

  const pedidos = await prisma.order.findMany({
    where: {
      tenantId: user.tenantId,
      status: "FECHADO",
      fechadoEm: { not: null, ...(desde ? { gte: desde } : {}), ...(ate ? { lte: ate } : {}) },
      ...(gestao ? {} : { createdById: user.id }),
    },
    select: {
      numero: true,
      totalCents: true,
      status: true,
      createdById: true,
      fechadoEm: true,
      contact: { select: { name: true, phoneNumber: true, waJid: true } },
    },
    orderBy: { fechadoEm: "desc" },
  });

  // O detalhe de cada linha: os mesmos pedidos que entraram na soma, para a
  // consultora poder conferir o total em vez de confiar no número.
  const detalhe = pedidos.map((p) => ({
    numero: p.numero,
    cliente: p.contact.name?.trim() || p.contact.phoneNumber || p.contact.waJid.split("@")[0],
    fechadoEm: p.fechadoEm,
    totalCents: p.totalCents,
    usuarioId: p.createdById,
  }));

  const linhas = comissaoPorConsultora(pedidos);
  const usuarios = await prisma.user.findMany({
    where: { tenantId: user.tenantId, ...(gestao ? {} : { id: user.id }) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    linhas,
    pedidos: detalhe,
    usuarios,
    faixas: FAIXAS_PADRAO,
    gestao,
    meuId: user.id,
    totalVendidoCents: linhas.reduce((s, l) => s + l.vendidoCents, 0),
    totalComissaoCents: linhas.reduce((s, l) => s + l.comissaoCents, 0),
  });
}
