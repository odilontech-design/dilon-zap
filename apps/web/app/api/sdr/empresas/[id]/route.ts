import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { rotaSdr } from "@/lib/sdr/rota";

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

/** Correção manual dos dados da empresa (site, e-mail, telefone, local, segmento, nome). Passa pelos mesmos normalizadores da importação. */
export async function PATCH(req: Request, { params }: Contexto) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    await a.sdr.comercial.editarEmpresa(params.id, corpo);
    await logAudit({ actor: a.user, action: "sdr.empresa.editada", metadata: { empresaId: params.id } });
    return a.sdr.empresas.obter(params.id);
  });
}
