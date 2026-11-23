import { NextResponse } from "next/server";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { primeirosPassosDaRevenda } from "@/lib/primeiros-passos";

/** Primeiros passos da revenda (a gestão da própria loja). O tenant vem da sessão, nunca da URL. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const r = await primeirosPassosDaRevenda(user.tenantId);
  if (!r) return NextResponse.json({ error: "revenda de veículos não ligada nesta empresa" }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
