import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";
import { definirControleDaConversa, obterControleDaConversa } from "@dilon-zap/vendedor-ia/src/saas/vendedor";

/**
 * O controle do vendedor numa conversa, direto do Inbox: ligar (o vendedor passa a responder esta conversa, mesmo fora do SDR),
 * desligar (o freio: cancela o que a IA deixou na fila e nada mais é respondido) ou voltar às regras automáticas do SDR.
 * Mesmo portão do SDR: o recurso ligado na empresa e o papel de quem pode ler ou escrever.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(null, "ler", (a) => obterControleDaConversa(a.user.tenantId, params.id));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await definirControleDaConversa(a.user.tenantId, params.id, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.vendedor.controle_da_conversa", metadata: { conversationId: params.id, acao: (corpo as { acao?: string } | null)?.acao, controle: r.controle, canceladas: r.canceladas } });
    return r;
  });
}
