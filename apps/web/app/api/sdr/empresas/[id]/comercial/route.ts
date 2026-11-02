import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

type Ctx = { params: { id: string } };

/** Ficha comercial: decisor, etapa, próxima ação, abordagens e histórico. */
export async function GET(_req: Request, { params }: Ctx) {
  return rotaSdr(null, "ler", (a) => a.sdr.comercial.ficha(params.id));
}

export async function PUT(req: Request, { params }: Ctx) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const salvo = await a.sdr.comercial.salvar(params.id, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.comercial.atualizado", metadata: { empresaId: params.id } });
    return salvo;
  });
}
