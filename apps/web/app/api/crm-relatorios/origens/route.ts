import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { funilDaEmpresa } from "@/lib/funis";
import { calcularPorOrigem } from "@/lib/relatorio-origem";
import type { NegociacaoIn } from "@/lib/funil-indicadores";

function data(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Origem dos leads: por funil (ou todos juntos), recortado pela data de criação. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê este relatório" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const pedido = q.get("funilId");
  const todos = pedido === "todos";

  const funis = await prisma.funil.findMany({
    where: { tenantId: user.tenantId, arquivadoEm: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, nome: true },
  });

  let funilId: string | null = null;
  let etapaSqlId: string | null = null;
  if (!todos) {
    const funil = await funilDaEmpresa(user.tenantId, pedido);
    if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });
    funilId = funil.id;
    // "Qualificado" é a segunda etapa do funil, como nos indicadores de SaaS.
    // Em "todos os funis" cada um tem a sua; a coluna é omitida.
    const etapas = await prisma.stage.findMany({ where: { funilId }, orderBy: { position: "asc" }, select: { id: true } });
    etapaSqlId = etapas[1]?.id ?? null;
  }

  const brutas = await prisma.negociacao.findMany({ where: { tenantId: user.tenantId, ...(funilId ? { funilId } : {}) } });
  const negociacoes: NegociacaoIn[] = brutas.map((n) => ({
    id: n.id,
    funilId: n.funilId,
    stageId: n.stageId,
    status: n.status,
    valorCents: n.valorCents,
    recorrencia: n.recorrencia,
    valorMensalCents: n.valorMensalCents,
    responsavelId: n.responsavelId,
    origem: n.origem,
    motivoPerdaId: n.motivoPerdaId,
    previsaoFechamento: n.previsaoFechamento,
    etapaDesde: n.etapaDesde,
    createdAt: n.createdAt,
    fechadaEm: n.fechadaEm,
  }));

  const eventos = etapaSqlId
    ? await prisma.historicoDeEtapa.findMany({
        where: { negociacaoId: { in: brutas.map((n) => n.id) } },
        select: { negociacaoId: true, tipo: true, paraStageId: true, em: true },
      })
    : [];

  const relatorio = calcularPorOrigem({ negociacoes, eventos, etapaSqlId, desde: data(q.get("desde")), ate: data(q.get("ate")) });

  return NextResponse.json({ ...relatorio, funis, funilId: todos ? "todos" : funilId, temSql: !!etapaSqlId });
}
