import { NextResponse } from "next/server";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { painelDeLeads } from "@/lib/painel-leads";

/** Veículos > Leads: o painel de atenção e do tempo de resposta (?dias=7|30|90). Só a gestão; a empresa vem da sessão. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const q = new URL(req.url).searchParams;
  const dias = [7, 30, 90].includes(Number(q.get("dias"))) ? Number(q.get("dias")) : 30;
  return NextResponse.json(await painelDeLeads(user.tenantId, dias), { headers: { "Cache-Control": "no-store" } });
}
