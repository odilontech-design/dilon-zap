import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/** Editar uma abordagem. Se estava aprovada, a aprovação cai e o texto novo precisa ser aprovado de novo. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.comercial.editarAbordagem(params.id, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.abordagem.editada", metadata: { abordagemId: params.id, versao: r.versao } });
    return r;
  });
}
