import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { painelNapista } from "@/lib/portais-napista";

/** Painel do NaPista: conta, plano padrão, contagem por status e o que está com problema. */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelNapista(user.tenantId));
}
