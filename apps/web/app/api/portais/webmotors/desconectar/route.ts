import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { desconectarWebmotors } from "@/lib/portais-webmotors";

/** Para de sincronizar com a Webmotors; os anúncios que já estão lá ficam como estão. */
export async function POST() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão desconecta portais" }, { status: 403 });
  await desconectarWebmotors(user.tenantId);
  await logAudit({ actor: user, action: "portais.webmotors.desconectar" });
  return NextResponse.json({ ok: true });
}
