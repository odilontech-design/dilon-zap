import { NextResponse } from "next/server";
import { assinarEstado, credenciaisDoAmbiente, urlDeAutorizacao } from "@dilon-zap/portais";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { segredoDosPortais } from "@/lib/portais";

/** Leva a gestão da loja para a OLX autorizar o Zap a publicar os anúncios. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão conecta portais" }, { status: 403 });
  const app = credenciaisDoAmbiente();
  const segredo = segredoDosPortais();
  if (!app || !segredo) return NextResponse.json({ error: "integração com a OLX ainda não configurada no servidor" }, { status: 503 });
  const estado = assinarEstado({ tenantId: user.tenantId, userId: user.id, portal: "OLX" }, segredo);
  return NextResponse.redirect(urlDeAutorizacao(app, estado));
}
