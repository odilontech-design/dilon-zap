import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { criarCampanhaSchema } from "@/lib/sdr/esquemas";

export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  return NextResponse.json({ campanhas: await acesso.repo.listarCampanhas(), podeEscrever: acesso.podeEscrever });
}

export async function POST(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const parsed = criarCampanhaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return dadosInvalidos();
  try {
    const campanha = await acesso.repo.criarCampanha(parsed.data, acesso.user);
    await logAudit({ actor: acesso.user, action: "sdr.campanha.criada", metadata: { campanhaId: campanha?.id } });
    return NextResponse.json(campanha, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
