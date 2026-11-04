import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { criarPerfilSchema } from "@/lib/sdr/esquemas";

export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  return NextResponse.json({ perfis: await acesso.repo.listarPerfis(), podeEscrever: acesso.podeEscrever });
}

export async function POST(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const parsed = criarPerfilSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return dadosInvalidos();
  try {
    const perfil = await acesso.repo.criarPerfil(parsed.data, acesso.user);
    await logAudit({ actor: acesso.user, action: "sdr.perfil.criado", metadata: { perfilId: perfil.id } });
    return NextResponse.json(perfil, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
