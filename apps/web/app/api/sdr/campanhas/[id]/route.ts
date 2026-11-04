import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { editarCampanhaSchema } from "@/lib/sdr/esquemas";

type Contexto = { params: { id: string } };

export async function GET(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  const campanha = await acesso.repo.obterCampanha(params.id);
  if (!campanha) return NextResponse.json({ error: "campanha não encontrada" }, { status: 404 });
  return NextResponse.json(campanha);
}

export async function PATCH(req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const parsed = editarCampanhaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return dadosInvalidos();
  try {
    const campanha = await acesso.repo.editarCampanha(params.id, parsed.data);
    await logAudit({ actor: acesso.user, action: "sdr.campanha.editada", metadata: { campanhaId: params.id, status: parsed.data.status } });
    return NextResponse.json(campanha);
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    await acesso.repo.excluirCampanha(params.id);
    await logAudit({ actor: acesso.user, action: "sdr.campanha.excluida", metadata: { campanhaId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
