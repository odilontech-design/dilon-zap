import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { reativarCarroDoSite } from "@/lib/espelho-do-site";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/**
 * "Foi engano, o carro continua à venda": volta para a vitrine e deixa de ser
 * comparado com o site antigo. (Se foi vendido, a gestão registra a venda pela
 * ficha, como sempre.)
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  const ok = await reativarCarroDoSite(user.tenantId, params.id, user.id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "este carro não está marcado como fora do site" }, { status: 404 });
}
