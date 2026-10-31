import { NextResponse } from "next/server";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { filtroPainelSchema } from "@/lib/sdr/esquemas";

/** Indicadores do painel do SDR: empresas únicas da organização, com filtro por campanha, perfil, UF, cidade e segmento. */
export async function GET(req: Request) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);

  const filtro = filtroPainelSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filtro.success) return dadosInvalidos();
  try {
    return NextResponse.json(await acesso.sdr.painel.indicadores(filtro.data));
  } catch (e) {
    return respostaDeErro(e);
  }
}
