import { rotaSdr } from "@/lib/sdr/rota";

/** O funil de cada campanha: da fila até a conversão, com taxa e tempo de resposta. */
export async function GET() {
  return rotaSdr(null, "ler", (a) => a.sdr.fila.funil());
}
