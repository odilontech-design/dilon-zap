import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { conferirNapista } from "@/lib/portais-napista";

/** Ensaio da troca de sistema: o que a loja já tem no NaPista contra o estoque do Zap (só leitura). */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  try {
    const r = await conferirNapista(user.tenantId);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "conecte o NaPista primeiro" }, { status: 409 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "o NaPista não respondeu" }, { status: 502 });
  }
}
