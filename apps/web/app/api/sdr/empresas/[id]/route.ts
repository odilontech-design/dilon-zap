import { NextResponse } from "next/server";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

type Contexto = { params: { id: string } };

export async function GET(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  try {
    return NextResponse.json(await acesso.sdr.empresas.obter(params.id));
  } catch (e) {
    return respostaDeErro(e);
  }
}
