import { limitesDoSdr, criarEnviadorSmtp } from "@/lib/sdr/smtp";
import { rotaSdr } from "@/lib/sdr/rota";

/** Se o envio de e-mail está ligado no servidor, de qual endereço sai e quanto já foi usado hoje. Nunca devolve senha. */
export async function GET() {
  return rotaSdr(null, "ler", async (a) => ({ ...(await a.sdr.comercial.situacaoDoEmail(criarEnviadorSmtp(), limitesDoSdr().emailPorDia)), whatsapp: limitesDoSdr().whatsapp }));
}
