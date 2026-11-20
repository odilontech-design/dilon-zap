import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { equipe } from "@/lib/instagram-api";
import { desconectarInstagram } from "@/lib/instagram";

/** Para de receber e responder; o histórico das conversas fica. */
export async function POST() {
  const { user, bloqueio } = await equipe(true);
  if (bloqueio) return bloqueio;
  await desconectarInstagram(user.tenantId);
  await logAudit({ actor: user, action: "instagram.desconectar" });
  return NextResponse.json({ ok: true });
}
