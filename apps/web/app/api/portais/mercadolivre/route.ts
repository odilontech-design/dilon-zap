import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { painelMercadoLivre } from "@/lib/portais-mercadolivre";

/** Painel do Mercado Livre: conta, vagas do pacote, contagem por status e o que está com problema. */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelMercadoLivre(user.tenantId));
}
