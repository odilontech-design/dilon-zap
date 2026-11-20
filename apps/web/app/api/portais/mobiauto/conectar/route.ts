import { NextResponse } from "next/server";
import { gestaoDosPortais, urlBaseDaRequisicao } from "@/lib/portais-api";
import { urlDeConexaoMobiauto } from "@/lib/portais-mobiauto";

/** Leva a gestão da loja à MobiAuto para autorizar o Zap a publicar o estoque. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const url = urlDeConexaoMobiauto(user.tenantId, user.id, urlBaseDaRequisicao(req));
  if (!url) return NextResponse.json({ error: "integração com a MobiAuto ainda não configurada no servidor" }, { status: 503 });
  return NextResponse.redirect(url);
}
