import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { syncWhatsAppGroups } from "@/lib/worker-client";

// "Atualizar lista" da tela de grupos. Quem trava a repetição é o worker, que
// é quem fala com o WhatsApp — aqui só repassa a resposta.
export async function POST() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const r = await syncWhatsAppGroups(user.tenantId);
  if (!r.ok) {
    return NextResponse.json({ error: r.reason ?? "não foi possível atualizar agora" }, { status: 409 });
  }
  return NextResponse.json({ total: r.total ?? 0 });
}
