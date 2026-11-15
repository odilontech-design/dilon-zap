import { NextResponse } from "next/server";
import { gestaoDosPortais, urlBaseDaRequisicao } from "@/lib/portais-api";
import { urlDeConexaoNapista } from "@/lib/portais-napista";

/** Leva a gestão da loja ao NaPista para autorizar o Zap a publicar o estoque. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const url = urlDeConexaoNapista(user.tenantId, user.id, urlBaseDaRequisicao(req));
  if (!url) return NextResponse.json({ error: "integração com o NaPista ainda não configurada no servidor" }, { status: 503 });
  return NextResponse.redirect(url);
}
