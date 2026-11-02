import { rotaSdr } from "@/lib/sdr/rota";

/** "Meu Comercial de Hoje": os blocos da rotina, cada um com o total e as primeiras empresas. */
export async function GET() {
  return rotaSdr(null, "ler", (a) => a.sdr.comercial.hoje());
}
