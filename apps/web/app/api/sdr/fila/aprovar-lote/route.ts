import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/**
 * Autoriza o lote do dia: aprova de uma vez os rascunhos da fila (ou os escolhidos). Aprovar não envia nada: só libera cada
 * mensagem para ser contatada, uma por clique (WhatsApp, com limite diário e intervalo), por e-mail com confirmação ou por
 * ligação, com o texto exatamente como estava na tela.
 */
export async function POST(req: Request) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.fila.aprovarLote(corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.fila.lote-aprovado", metadata: { aprovadas: r.aprovadas, falhas: r.falhas.length } });
    return r;
  });
}
