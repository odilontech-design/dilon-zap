import { NextResponse } from "next/server";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

/** Valores de UF, cidade e segmento que existem nas empresas da organização, para os filtros da lista. */
export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  try {
    return NextResponse.json(await acesso.sdr.painel.opcoes());
  } catch (e) {
    return respostaDeErro(e);
  }
}
