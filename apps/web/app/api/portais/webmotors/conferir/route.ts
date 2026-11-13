import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { conferirWebmotors } from "@/lib/portais-webmotors";

/** Ensaio da troca de sistema: o que a loja já tem na Webmotors contra o estoque do Zap (só leitura). */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 });
  try {
    const r = await conferirWebmotors(user.tenantId);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "conecte a Webmotors primeiro" }, { status: 409 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a Webmotors não respondeu" }, { status: 502 });
  }
}
