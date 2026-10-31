import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

type Contexto = { params: { id: string } };

/** Tira da lista. Só quem pode escrever, e fica na auditoria. */
export async function DELETE(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    await acesso.sdr.supressoes.remover(params.id);
    await logAudit({ actor: acesso.user, action: "sdr.supressao.removida", metadata: { supressaoId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
