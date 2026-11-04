import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(null, "escrever", async (a) => {
    const r = await a.sdr.comercial.rejeitarAbordagem(params.id, a.user);
    await logAudit({ actor: a.user, action: "sdr.abordagem.rejeitada", metadata: { abordagemId: params.id } });
    return r;
  });
}
