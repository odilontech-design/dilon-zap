import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/** Resposta ou resultado de um contato (respondeu, interesse, reunião, sem interesse, não contatar...) e a data do follow-up. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.comercial.registrarResultado(params.id, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.comercial.resultado", metadata: { empresaId: params.id, etapa: r.etapa, bloqueados: r.bloqueados } });
    return r;
  });
}
