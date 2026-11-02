import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/** Cria uma abordagem escrita à mão, ou a partir do modelo neutro (sem IA). Nasce como rascunho. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(
    req,
    "escrever",
    async (a, corpo) => {
      const criada = await a.sdr.comercial.criarAbordagem(params.id, corpo, a.user);
      await logAudit({ actor: a.user, action: "sdr.abordagem.criada", metadata: { empresaId: params.id, abordagemId: criada.id, origem: criada.origem } });
      return criada;
    },
    201
  );
}
