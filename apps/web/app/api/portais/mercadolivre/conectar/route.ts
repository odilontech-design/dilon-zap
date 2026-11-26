import { NextResponse } from "next/server";
import { gestaoDosPortais, urlBaseDaRequisicao } from "@/lib/portais-api";
import { urlDeConexaoMercadoLivre } from "@/lib/portais-mercadolivre";

/** Leva a gestão da loja ao Mercado Livre para autorizar o Zap a publicar o estoque. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const url = urlDeConexaoMercadoLivre(user.tenantId, user.id, urlBaseDaRequisicao(req));
  if (!url) return NextResponse.json({ error: "integração com o Mercado Livre ainda não configurada no servidor" }, { status: 503 });
  return NextResponse.redirect(url);
}
