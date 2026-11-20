import { prisma } from "@dilon-zap/db";
import { PRECOS, estimarCustoPorLead, usoDoMes } from "@dilon-zap/vendedor-ia";

/**
 * O lado do painel do Vendedor IA: ligar e desligar, e o resumo do mês. A
 * IA em si roda no apps/vendedor-ia-worker (ver packages/vendedor-ia).
 */

export const ESFORCOS = ["low", "medium", "high"] as const;

export async function configDoVendedorIa(tenantId: string) {
  return prisma.vendedorIaConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
}

/**
 * Liga ou desliga a IA. Ligar desliga as automações (saudação, menu de
 * triagem, aviso de ausência) do número geral, senão o cliente recebe as duas
 * respostas; desligar devolve como estava.
 */
export async function ligarOuDesligar(tenantId: string, ligar: boolean) {
  const cfg = await configDoVendedorIa(tenantId);
  if (ligar === cfg.ativo) return;
  const gerais = await prisma.whatsAppSession.findMany({ where: { tenantId, setorId: null }, select: { id: true, semAutomacoes: true } });
  await prisma.$transaction(async (tx) => {
    if (ligar) {
      await tx.vendedorIaConfig.update({
        where: { tenantId },
        data: { ativo: true, ativadoEm: new Date(), semAutomacoesAntes: gerais[0]?.semAutomacoes ?? false },
      });
      await tx.whatsAppSession.updateMany({ where: { tenantId, setorId: null }, data: { semAutomacoes: true } });
    } else {
      await tx.vendedorIaConfig.update({ where: { tenantId }, data: { ativo: false } });
      await tx.whatsAppSession.updateMany({ where: { tenantId, setorId: null }, data: { semAutomacoes: cfg.semAutomacoesAntes ?? false } });
    }
  });
}

export async function painelDoMes(tenantId: string) {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const [uso, transferidas, porMotivo, ultimas] = await Promise.all([
    usoDoMes(tenantId, agora),
    prisma.vendedorIaConversa.count({ where: { tenantId, iniciadaEm: { gte: inicio }, status: "TRANSFERIDA" } }),
    prisma.vendedorIaConversa.groupBy({ by: ["motivo"], where: { tenantId, iniciadaEm: { gte: inicio }, status: "TRANSFERIDA" }, _count: true }),
    prisma.vendedorIaConversa.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take: 15 }),
  ]);
  const custos = await prisma.vendedorIaUso.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: ultimas.map((u) => u.conversationId) } },
    _sum: { custoMicrosUsd: true },
  });
  const conversas = await prisma.conversation.findMany({
    where: { id: { in: ultimas.map((u) => u.conversationId) } },
    select: { id: true, contact: { select: { name: true, waName: true, phoneNumber: true } } },
  });
  const custoDe = new Map(custos.map((c) => [c.conversationId, c._sum.custoMicrosUsd ?? 0]));
  const contatoDe = new Map(conversas.map((c) => [c.id, c.contact.name ?? c.contact.waName ?? c.contact.phoneNumber ?? "Sem nome"]));

  return {
    leads: uso.leads,
    transferidas,
    custoMicrosUsd: uso.custoMicrosUsd,
    custoMedioMicrosUsd: uso.leads ? Math.round(uso.custoMicrosUsd / uso.leads) : null,
    porMotivo: porMotivo.map((m) => ({ motivo: m.motivo ?? "—", total: m._count })),
    ultimas: ultimas.map((u) => ({
      conversationId: u.conversationId,
      contato: contatoDe.get(u.conversationId) ?? "—",
      status: u.status,
      motivo: u.motivo,
      resumo: u.resumo,
      turnos: u.turnos,
      atualizadaEm: u.updatedAt,
      custoMicrosUsd: custoDe.get(u.conversationId) ?? 0,
    })),
  };
}

/** A estimativa de custo por lead de cada modelo, para a tela comparar. */
export function estimativas() {
  return Object.entries(PRECOS).map(([id, p]) => ({ id, nome: p.nome, aproximado: !!p.aproximado, usdPorLead: estimarCustoPorLead(id).usdPorLead }));
}
