import { NextResponse } from "next/server";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { painelDeLeads } from "@/lib/painel-leads";

/** Veículos > Leads: o painel de atenção e do tempo de resposta (?dias=7|30|90; ?whatsapp=0 deixa de fora as conversas diretas de WhatsApp). Só a gestão; a empresa vem da sessão. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const q = new URL(req.url).searchParams;
  const dias = [7, 30, 90].includes(Number(q.get("dias"))) ? Number(q.get("dias")) : 30;
  const whatsapp = q.get("whatsapp") !== "0";
  return NextResponse.json(await painelDeLeads(user.tenantId, dias, new Date(), { whatsapp }), { headers: { "Cache-Control": "no-store" } });
}
