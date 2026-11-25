import { NextResponse } from "next/server";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { painelDoEstoque } from "@/lib/painel-estoque";

/** Veículos > Painel: a visão do dono sobre o pátio. Só a gestão; a empresa vem da sessão. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelDoEstoque(user.tenantId), { headers: { "Cache-Control": "no-store" } });
}
