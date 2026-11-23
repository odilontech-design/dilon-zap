import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { primeirosPassosDaRevenda } from "@/lib/primeiros-passos";

/** Implantação de uma revenda, vista pela Dilon Tech (Super Admin). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const r = await primeirosPassosDaRevenda(params.id);
  if (!r) return NextResponse.json({ error: "esta empresa não tem a revenda de veículos" }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
