import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { criarNegociacao } from "@/lib/negociacoes";
import { espelharNoCrm } from "@/lib/sdr/crm";
import { rotaSdr } from "@/lib/sdr/rota";

/**
 * O mesmo resultado para várias empresas já contatadas (respondeu, interesse, reunião, sem interesse, não contatar).
 * Cada empresa passa pelas regras do resultado individual, inclusive o espelho no CRM; uma que falha não derruba as outras.
 */
export async function POST(req: Request) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.fila.resultadosEmLote(corpo, a.user);
    const nota = typeof (corpo as { nota?: unknown } | null)?.nota === "string" ? ((corpo as { nota: string }).nota.trim() || null) : null;
    const itens = [];
    for (const i of r.itens) {
      if (!i.ok) {
        itens.push(i);
        continue;
      }
      const crm = await espelharNoCrm({ acesso: a, empresaId: i.empresaId, prisma, criarNegociacao }, { tipo: "RESPOSTA", etapa: i.etapa, nota });
      itens.push({ ...i, crm });
    }
    await logAudit({ actor: a.user, action: "sdr.fila.resultado-em-lote", metadata: { etapa: itens.find((i) => i.ok)?.etapa ?? null, aplicadas: r.aplicadas, falhas: r.falhas } });
    return { ...r, itens };
  });
}
