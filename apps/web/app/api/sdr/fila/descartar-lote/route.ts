import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/**
 * Descarta de uma vez os rascunhos da fila (ou os escolhidos), por exemplo depois de trocar o modelo da campanha. Só mexe
 * em rascunho: nada aprovado nem contatado é tocado, e nada é enviado. O próximo "Preparar" gera o texto de novo.
 */
export async function POST(req: Request) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.fila.descartarLote(corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.fila.lote-descartado", metadata: { descartadas: r.descartadas, falhas: r.falhas.length } });
    return r;
  });
}
