import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { ErpIndisponivelError, listarAceites } from "@/lib/erp-contabilidade";

/** Histórico de aceites e recusas do termo desta empresa (a prova). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  try {
    return NextResponse.json({ aceites: await listarAceites(params.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ErpIndisponivelError ? e.message : "Falha ao falar com o ERP." }, { status: 502 });
  }
}
