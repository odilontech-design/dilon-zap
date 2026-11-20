import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { registrarLeadsNaOlx } from "@/lib/portais";

/** Registra de novo, na OLX, o endereço que recebe os leads (botão "Tentar de novo"). */
export async function POST() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 });
  const r = await registrarLeadsNaOlx(user.tenantId, (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, ""));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: 502 });
}
