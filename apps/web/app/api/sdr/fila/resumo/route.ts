import { rotaSdr } from "@/lib/sdr/rota";
import { limitesDoSdr } from "@/lib/sdr/smtp";

/** Os números do dia: quantas estão prontas, a revisar e a preparar, e quanto resta do limite de WhatsApp. */
export async function GET(req: Request) {
  const filtro = Object.fromEntries(new URL(req.url).searchParams);
  return rotaSdr(null, "ler", (a) => a.sdr.fila.resumo(limitesDoSdr().whatsapp, filtro));
}
