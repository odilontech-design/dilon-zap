import { prisma } from "@dilon-zap/db";
import { inicioDoDia, inicioDoMes, obterConfigIa } from "./config";

/** O que a tela de controle da IA mostra: quanto foi gasto, contra qual limite, e por onde foi. */
export async function resumoDeUsoIa(tenantId: string, agora = new Date()) {
  const cfg = await obterConfigIa(tenantId);
  const dia = inicioDoDia(agora);
  const mes = inicioDoMes(agora);
  const vigente = [{ status: { not: "EM_ANDAMENTO" as const } }, { status: "EM_ANDAMENTO" as const, createdAt: { gte: new Date(agora.getTime() - 10 * 60_000) } }];

  const [hoje, doMes, porTarefa, porCampanha, porStatus, recentes] = await Promise.all([
    prisma.sdrIaUso.aggregate({ where: { tenantId, createdAt: { gte: dia }, OR: vigente }, _sum: { custoMicro: true } }),
    prisma.sdrIaUso.aggregate({ where: { tenantId, createdAt: { gte: mes }, OR: vigente }, _sum: { custoMicro: true } }),
    prisma.sdrIaUso.groupBy({ by: ["tarefa", "modelo"], where: { tenantId, createdAt: { gte: mes }, status: { in: ["OK", "RESPOSTA_INVALIDA", "ERRO"] } }, _sum: { custoMicro: true, tokensEntrada: true, tokensSaida: true }, _count: { _all: true } }),
    prisma.sdrIaUso.groupBy({ by: ["campanhaId"], where: { tenantId, createdAt: { gte: mes }, status: { in: ["OK", "RESPOSTA_INVALIDA", "ERRO"] } }, _sum: { custoMicro: true }, _count: { _all: true } }),
    prisma.sdrIaUso.groupBy({ by: ["status"], where: { tenantId, createdAt: { gte: mes } }, _count: { _all: true } }),
    prisma.sdrIaUso.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, tarefa: true, provedor: true, modelo: true, status: true, custoMicro: true, erro: true, campanhaId: true } }),
  ]);

  return {
    ativa: cfg.ativa,
    orcamentoDiarioMicro: cfg.orcamentoDiarioMicro,
    orcamentoMensalMicro: cfg.orcamentoMensalMicro,
    gastoHojeMicro: hoje._sum.custoMicro ?? 0,
    gastoMesMicro: doMes._sum.custoMicro ?? 0,
    porTarefa: porTarefa.map((r) => ({ tarefa: r.tarefa, modelo: r.modelo, chamadas: r._count._all, custoMicro: r._sum.custoMicro ?? 0, tokensEntrada: r._sum.tokensEntrada ?? 0, tokensSaida: r._sum.tokensSaida ?? 0 })),
    porCampanha: porCampanha.map((r) => ({ campanhaId: r.campanhaId, chamadas: r._count._all, custoMicro: r._sum.custoMicro ?? 0 })),
    porStatus: Object.fromEntries(porStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    recentes,
  };
}
