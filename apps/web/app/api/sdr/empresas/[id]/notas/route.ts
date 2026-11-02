import { z } from "zod";
import { rotaSdr } from "@/lib/sdr/rota";

const notaSchema = z.object({ texto: z.string().trim().min(1).max(4000) }).strict();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(req, "escrever", (a, corpo) => a.sdr.comercial.registrarNota(params.id, notaSchema.parse(corpo).texto, a.user), 201);
}
