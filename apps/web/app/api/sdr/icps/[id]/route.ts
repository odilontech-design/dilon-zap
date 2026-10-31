import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { editarPerfilSchema } from "@/lib/sdr/esquemas";

type Contexto = { params: { id: string } };

export async function GET(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  const perfil = await acesso.repo.obterPerfil(params.id);
  if (!perfil) return NextResponse.json({ error: "perfil de cliente não encontrado" }, { status: 404 });
  return NextResponse.json(perfil);
}

export async function PATCH(req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const parsed = editarPerfilSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return dadosInvalidos();
  try {
    const perfil = await acesso.repo.editarPerfil(params.id, parsed.data);
    await logAudit({ actor: acesso.user, action: "sdr.perfil.editado", metadata: { perfilId: params.id } });
    return NextResponse.json(perfil);
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function DELETE(_req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    await acesso.repo.excluirPerfil(params.id);
    await logAudit({ actor: acesso.user, action: "sdr.perfil.excluido", metadata: { perfilId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
