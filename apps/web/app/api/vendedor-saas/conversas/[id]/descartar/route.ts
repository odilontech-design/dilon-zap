import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";
import { descartarSugestao } from "@dilon-zap/vendedor-ia/src/saas/vendedor";

/** Descarta a resposta sugerida. A conversa segue com a IA e só gera outra sugestão quando a empresa escrever de novo. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(null, "escrever", async (a) => {
    const r = await descartarSugestao(a.user.tenantId, params.id);
    await logAudit({ actor: a.user, action: "sdr.vendedor.sugestao_descartada", metadata: { conversationId: params.id } });
    return r;
  });
}
