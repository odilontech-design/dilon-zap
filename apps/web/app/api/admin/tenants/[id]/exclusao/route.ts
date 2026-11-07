import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { impactoDaExclusao } from "@/lib/excluir-empresa";

/** O que a exclusão levaria e o que a impede — alimenta a janela de confirmação. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const impacto = await impactoDaExclusao(params.id, admin.tenantId);
  if (!impacto) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });
  return NextResponse.json(impacto);
}
