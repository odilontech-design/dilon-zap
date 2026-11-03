import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/** Cria os rascunhos (modelo neutro, sem IA) das empresas da fila que ainda não têm mensagem. Não aprova nem envia nada. */
export async function POST(req: Request) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const r = await a.sdr.fila.preparar(corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.fila.preparada", metadata: { criadas: r.criadas, jaTinham: r.jaTinham, semContato: r.semContato, falhas: r.falhas.length } });
    return r;
  });
}
