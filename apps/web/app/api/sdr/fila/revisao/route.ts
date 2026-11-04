import { rotaSdr } from "@/lib/sdr/rota";

/** Os rascunhos a revisar, na ordem da fila. Aprovar, editar e rejeitar usam as rotas de /api/sdr/abordagens. */
export async function GET(req: Request) {
  const filtro = Object.fromEntries(new URL(req.url).searchParams);
  return rotaSdr(null, "ler", (a) => a.sdr.fila.revisao(filtro));
}
