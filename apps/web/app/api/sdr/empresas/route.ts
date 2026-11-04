import { NextResponse } from "next/server";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { filtroEmpresasSchema } from "@/lib/sdr/esquemas";

/** Empresas da organização, com filtro por campanha, ICP, situação, bloqueio e busca. */
export async function GET(req: Request) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);

  const filtro = filtroEmpresasSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filtro.success) return dadosInvalidos();
  try {
    return NextResponse.json({ ...(await acesso.sdr.empresas.listar(filtro.data)), podeEscrever: acesso.podeEscrever });
  } catch (e) {
    return respostaDeErro(e);
  }
}
