import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

type Contexto = { params: { id: string } };

/** Qualifica de novo todos os prospectos da campanha, por exemplo depois de mudar o ICP. */
export async function POST(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    const r = await acesso.sdr.empresas.requalificarCampanha(params.id);
    await logAudit({ actor: acesso.user, action: "sdr.campanha.requalificada", metadata: { campanhaId: params.id } });
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
