import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { painelMobiauto } from "@/lib/portais-mobiauto";

/** Painel da MobiAuto: conta, plano padrão, contagem por status e o que está com problema. */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelMobiauto(user.tenantId));
}
