import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";

/**
 * Para de sincronizar com a OLX. Os anúncios que já estão lá ficam como
 * estão (a loja pode tirá-los no painel da OLX): apagar tudo sem aviso num
 * clique de "desconectar" faria mais mal do que bem.
 */
export async function POST() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão desconecta portais" }, { status: 403 });
  await prisma.portalConta.updateMany({
    where: { tenantId: user.tenantId, portal: "OLX" },
    data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null },
  });
  await logAudit({ actor: user, action: "portais.olx.desconectar" });
  return NextResponse.json({ ok: true });
}
