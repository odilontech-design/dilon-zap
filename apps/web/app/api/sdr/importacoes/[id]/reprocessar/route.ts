import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

type Contexto = { params: { id: string } };

/** Recoloca na fila as linhas que falharam. As já processadas não são tocadas. */
export async function POST(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    const r = await acesso.sdr.importacoes.reprocessar(params.id);
    await logAudit({ actor: acesso.user, action: "sdr.importacao.reprocessada", metadata: { importacaoId: params.id, liberadas: r.liberadas, jaNaFila: r.jaNaFila } });
    return NextResponse.json(r);
  } catch (e) {
    return respostaDeErro(e);
  }
}
