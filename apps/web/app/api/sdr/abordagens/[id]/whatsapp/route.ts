import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";
import { limitesDoSdr } from "@/lib/sdr/smtp";

/**
 * Autoriza abrir UMA conversa no Inbox com a mensagem aprovada. O sistema não envia nada: a tela "abrir conversa"
 * mostra o texto e quem envia é você, clicando em Enviar. Limite diário e intervalo mínimo entre aberturas.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(null, "escrever", async (a) => {
    const r = await a.sdr.comercial.abrirConversaNoWhatsapp(params.id, a.user, limitesDoSdr().whatsapp);
    await logAudit({ actor: a.user, action: "sdr.whatsapp.conversa-aberta", metadata: { abordagemId: params.id } });
    return r;
  });
}
