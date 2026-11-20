import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais } from "@/lib/portais-api";
import { desconectarNapista } from "@/lib/portais-napista";

/** Para de sincronizar com o NaPista; os anúncios que já estão lá ficam como estão. */
export async function POST() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  await desconectarNapista(user.tenantId);
  await logAudit({ actor: user, action: "portais.napista.desconectar" });
  return NextResponse.json({ ok: true });
}
