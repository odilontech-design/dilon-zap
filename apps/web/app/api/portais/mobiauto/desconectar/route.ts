import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais } from "@/lib/portais-api";
import { desconectarMobiauto } from "@/lib/portais-mobiauto";

/** Para de sincronizar com a MobiAuto; os anúncios que já estão lá ficam como estão. */
export async function POST() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  await desconectarMobiauto(user.tenantId);
  await logAudit({ actor: user, action: "portais.mobiauto.desconectar" });
  return NextResponse.json({ ok: true });
}
