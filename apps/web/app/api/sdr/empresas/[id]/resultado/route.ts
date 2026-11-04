import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { criarNegociacao } from "@/lib/negociacoes";
import { espelharNoCrm } from "@/lib/sdr/crm";
import { rotaSdr } from "@/lib/sdr/rota";

/** Resposta ou resultado de um contato (respondeu, interesse, reunião, sem interesse, não contatar...) e a data do follow-up. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.comercial.registrarResultado(params.id, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.comercial.resultado", metadata: { empresaId: params.id, etapa: r.etapa, bloqueados: r.bloqueados } });
    const nota = typeof (corpo as { nota?: unknown } | null)?.nota === "string" ? ((corpo as { nota: string }).nota.trim() || null) : null;
    const crm = await espelharNoCrm({ acesso: a, empresaId: params.id, prisma, criarNegociacao }, { tipo: "RESPOSTA", etapa: r.etapa, nota });
    return { ...r, crm };
  });
}
