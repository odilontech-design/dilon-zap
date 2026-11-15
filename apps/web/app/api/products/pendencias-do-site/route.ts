import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { pendenciasDoSite } from "@/lib/estoque-do-site";

/** GET /api/products/pendencias-do-site — produtos vendidos no site que ainda não estão vinculados a um produto daqui. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ pendencias: [] });
  return NextResponse.json({ pendencias: await pendenciasDoSite(user.tenantId) });
}
