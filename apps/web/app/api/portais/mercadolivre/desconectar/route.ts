import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais } from "@/lib/portais-api";
import { desconectarMercadoLivre } from "@/lib/portais-mercadolivre";

/** Para de sincronizar com o Mercado Livre; os anúncios que já estão lá ficam como estão. */
export async function POST() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  await desconectarMercadoLivre(user.tenantId);
  await logAudit({ actor: user, action: "portais.mercadolivre.desconectar" });
  return NextResponse.json({ ok: true });
}
