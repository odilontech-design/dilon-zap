import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { exigirRecurso } from "@/lib/plano";
import { funilDaEmpresa } from "@/lib/funis";
import { calcularSaas, chaveDoMes, ultimosMeses } from "@/lib/saas-indicadores";
import type { EventoIn, NegociacaoIn } from "@/lib/funil-indicadores";

/**
 * Indicadores de SaaS de um funil, mês a mês.
 *
 * Recurso sob demanda (FUNIL_SAAS) e só para a gestão: MRR e CAC são números
 * do negócio, não do atendimento.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê os indicadores" }, { status: 403 });
  const bloqueio = await exigirRecurso(user, "FUNIL_SAAS");
  if (bloqueio) return bloqueio;

  const q = new URL(req.url).searchParams;
  const mesAtual = chaveDoMes(new Date());
  const ate = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("ate") ?? "") ? q.get("ate")! : mesAtual;
  const quantos = Math.min(24, Math.max(1, Number(q.get("meses")) || 6));
  const meses = ultimosMeses(ate, quantos);

  const funil = await funilDaEmpresa(user.tenantId, q.get("funilId"));
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });

  const [funis, etapas, brutas, informados] = await Promise.all([
    prisma.funil.findMany({
      where: { tenantId: user.tenantId, arquivadoEm: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, nome: true },
    }),
    prisma.stage.findMany({ where: { funilId: funil.id }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    prisma.negociacao.findMany({ where: { tenantId: user.tenantId, funilId: funil.id } }),
    // Do mês mais antigo da janela para trás também entra: o ponto de partida
    // do MRR pode ter sido informado antes dela.
    prisma.metricaMensal.findMany({ where: { tenantId: user.tenantId, mes: { lte: ate } }, orderBy: { mes: "asc" } }),
  ]);

  // Por padrão a etapa de qualificação é a segunda do funil (a primeira é
  // onde todo lead nasce). Dá pra escolher outra.
  const pedida = q.get("etapaSqlId");
  const etapaSqlId = (pedida && etapas.find((e) => e.id === pedida)?.id) || etapas[1]?.id || null;

  const eventos: EventoIn[] = await prisma.historicoDeEtapa.findMany({
    where: { negociacaoId: { in: brutas.map((n) => n.id) } },
    select: { negociacaoId: true, tipo: true, paraStageId: true, em: true },
  });

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

  const { porMes, total } = calcularSaas({ meses, informados, negociacoes, eventos, etapaSqlId });

  return NextResponse.json({
    funil: { id: funil.id, nome: funil.nome },
    funis,
    etapas,
    etapaSqlId,
    meses: porMes,
    total,
    // O que foi digitado à mão, para preencher o formulário de cada mês.
    informados: informados.filter((i) => meses.includes(i.mes)),
  });
}
