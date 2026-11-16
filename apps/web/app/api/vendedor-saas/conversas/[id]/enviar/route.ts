import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";
import { enviarSugestao } from "@dilon-zap/vendedor-ia/src/saas/vendedor";

/**
 * Envia a resposta que o vendedor sugeriu (ou o texto que a pessoa editou). A mensagem fica PENDING na conversa e o worker
 * do WhatsApp a manda em poucos segundos, pelo mesmo caminho de todas as outras: quem envia aqui é uma pessoa, por clique.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await enviarSugestao(a.user.tenantId, params.id, corpo);
    await logAudit({ actor: a.user, action: "sdr.vendedor.sugestao_enviada", metadata: { conversationId: params.id, acao: r.acao } });
    return r;
  });
}
