import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(null, "escrever", async (a) => {
    const r = await a.sdr.comercial.aprovarAbordagem(params.id, a.user);
    await logAudit({ actor: a.user, action: "sdr.abordagem.aprovada", metadata: { abordagemId: params.id, versao: r.versaoAprovada, canal: r.canal } });
    return r;
  });
}
