import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { painelWebmotors } from "@/lib/portais-webmotors";

/** Painel da Webmotors: conta, plano padrão, contagem por status e o que está com problema. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 });
  return NextResponse.json(await painelWebmotors(user.tenantId));
}
