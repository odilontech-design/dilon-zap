import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { conferirMobiauto } from "@/lib/portais-mobiauto";

/** Ensaio da troca de sistema: o que a loja já tem na MobiAuto contra o estoque do Zap (só leitura). */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  try {
    const r = await conferirMobiauto(user.tenantId);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "conecte a MobiAuto primeiro" }, { status: 409 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a MobiAuto não respondeu" }, { status: 502 });
  }
}
