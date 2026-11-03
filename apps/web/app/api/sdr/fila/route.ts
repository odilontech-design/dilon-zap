import { rotaSdr } from "@/lib/sdr/rota";

/** A fila do dia: pronta para contatar, aguardando revisão e a preparar. Só leitura; o filtro é validado no núcleo. */
export async function GET(req: Request) {
  const filtro = Object.fromEntries(new URL(req.url).searchParams);
  return rotaSdr(null, "ler", (a) => a.sdr.fila.doDia(filtro));
}
