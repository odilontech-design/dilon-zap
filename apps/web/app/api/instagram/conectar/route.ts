import { NextResponse } from "next/server";
import { equipe, urlBaseDaRequisicao } from "@/lib/instagram-api";
import { urlDeConexaoInstagram } from "@/lib/instagram";

/** Leva a gestão da loja ao Instagram para autorizar o Zap a ler e responder as mensagens diretas. */
export async function GET(req: Request) {
  const { user, bloqueio } = await equipe(true);
  if (bloqueio) return bloqueio;
  const url = urlDeConexaoInstagram(user.tenantId, user.id, urlBaseDaRequisicao(req));
  if (!url) return NextResponse.json({ error: "integração com o Instagram ainda não configurada no servidor" }, { status: 503 });
  return NextResponse.redirect(url);
}
