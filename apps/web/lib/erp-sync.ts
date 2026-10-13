import { prisma } from "@dilon-zap/db";
import { acaoDeSincronizacao, decidirSuspensao, TOLERANCIA_PADRAO_DIAS } from "./erp-regras";
import { atualizarEscritorio, consultarEscritorio, erpConfigurado, ErpIndisponivelError, type ErpEscritorio } from "./erp-contabilidade";

/**
 * Faz o ERP refletir a cobrança: suspende quem deve suspender, reativa quem foi
 * suspenso AUTOMATICAMENTE e já regularizou, e atualiza o uso exibido no painel.
 *
 * O estado local só muda depois que o ERP confirmou; se o ERP estiver fora do ar,
 * nada muda e a próxima varredura tenta de novo.
 */
export type ResultadoSync = { tenantId: string; acao: "SUSPENDER" | "REATIVAR" | "NADA"; motivo?: string; erro?: string };

export const toleranciaEmDias = () => {
  const n = Number(process.env.ERP_TOLERANCIA_DIAS);
  return Number.isInteger(n) && n >= 0 && n <= 90 ? n : TOLERANCIA_PADRAO_DIAS;
};

export async function guardarUso(tenantId: string, e: ErpEscritorio) {
  await prisma.tenantErpContabilidade.update({
    where: { tenantId },
    data: {
      empresasAtivas: e.uso.empresasAtivas,
      usuariosEquipe: e.uso.usuariosEquipe,
      acessosPortal: e.uso.acessosPortal,
      ultimaAtividadeEm: e.uso.ultimaAtividadeEm ? new Date(e.uso.ultimaAtividadeEm) : null,
      usoAtualizadoEm: new Date(),
    },
  });
}

export async function sincronizarErp(tenantId: string, agora = new Date()): Promise<ResultadoSync> {
  const erp = await prisma.tenantErpContabilidade.findUnique({ where: { tenantId } });
  if (!erp) return { tenantId, acao: "NADA" };
  if (!erpConfigurado()) return { tenantId, acao: "NADA", erro: "integração com o ERP não configurada" };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscription: { select: { status: true } }, invoices: { where: { status: { in: ["PENDING", "OVERDUE"] } }, select: { status: true, dueDate: true } } },
  });
  const decisao = decidirSuspensao(tenant?.subscription ?? null, tenant?.invoices ?? [], agora, toleranciaEmDias());
  const acao = acaoDeSincronizacao({ status: erp.status, suspensoPor: erp.suspensoPor }, decisao);

  try {
    if (acao === "SUSPENDER" && decisao.suspender) {
      const e = await atualizarEscritorio(tenantId, { ativo: false, motivo: decisao.motivo });
      await prisma.tenantErpContabilidade.update({ where: { tenantId }, data: { status: "SUSPENSO", suspensoPor: "AUTO", suspensoMotivo: decisao.motivo, suspensoEm: agora } });
      await guardarUso(tenantId, e);
      return { tenantId, acao, motivo: decisao.motivo };
    }
    if (acao === "REATIVAR") {
      const e = await atualizarEscritorio(tenantId, { ativo: true });
      await prisma.tenantErpContabilidade.update({ where: { tenantId }, data: { status: "ATIVO", suspensoPor: null, suspensoMotivo: null, suspensoEm: null } });
      await guardarUso(tenantId, e);
      return { tenantId, acao, motivo: "cobrança regularizada" };
    }
    const e = await consultarEscritorio(tenantId);
    if (e) await guardarUso(tenantId, e);
    return { tenantId, acao: "NADA" };
  } catch (err) {
    return { tenantId, acao, erro: err instanceof ErpIndisponivelError ? err.message : "falha inesperada ao sincronizar" };
  }
}

export async function sincronizarTodos(): Promise<ResultadoSync[]> {
  const linhas = await prisma.tenantErpContabilidade.findMany({ select: { tenantId: true } });
  const resultados: ResultadoSync[] = [];
  for (const l of linhas) resultados.push(await sincronizarErp(l.tenantId));
  return resultados;
}
