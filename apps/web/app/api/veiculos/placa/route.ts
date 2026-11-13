import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { consultarPlaca } from "@/lib/placa";

/** "Buscar pela placa": devolve as características do carro para preencher a ficha. Só a gestão (é quem cadastra carro). */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cadastra veículos" }, { status: 403 });
  const r = await consultarPlaca(user.tenantId, new URL(req.url).searchParams.get("placa") ?? "");
  if (!r.ok) return NextResponse.json({ error: r.erro, semProvedor: r.semProvedor ?? false }, { status: r.semProvedor ? 501 : 422 });
  return NextResponse.json({ origem: r.origem, doCache: r.doCache, dados: r.dados });
}
