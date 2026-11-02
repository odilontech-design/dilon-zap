import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

const pedidoSchema = z
  .object({ produto: z.enum(["DILON_ZAP", "DILON_FACILITIES"]), problema: z.string().trim().max(500).nullable().optional(), campanhaId: z.string().trim().min(1).max(60).nullable().optional() })
  .strict();

/**
 * Gera rascunhos com a IA (e-mail, mensagem curta, roteiro de ligação e follow-up). Passa pelo gerenciador de IA:
 * respeita liga/desliga, orçamento e limites da empresa. Se a IA não puder responder, devolve ok:false com o motivo
 * e o trabalho segue à mão. Nada é aprovado nem enviado aqui.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const pedido = pedidoSchema.parse(corpo);
    const r = await a.sdr.comercial.gerarAbordagem(params.id, pedido, a.user);
    await logAudit({ actor: a.user, action: "sdr.abordagem.ia", metadata: { empresaId: params.id, produto: pedido.produto, ok: r.ok, motivo: r.ok ? undefined : r.motivo } });
    return r;
  });
}
