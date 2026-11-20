import { NextResponse } from "next/server";
import { z } from "zod";
import { gestaoDosPortais } from "@/lib/portais-api";
import { definirLojaNapista, lojasNapista } from "@/lib/portais-napista";

/** As lojas (sellers) que o usuário autorizado gerencia no NaPista. */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  try {
    return NextResponse.json({ lojas: (await lojasNapista(user.tenantId)) ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "o NaPista não respondeu" }, { status: 502 });
  }
}

/** Troca a loja usada pelo Zap (quando o usuário gerencia mais de uma). */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ sellerId: z.string().trim().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  return (await definirLojaNapista(user.tenantId, parsed.data.sellerId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "conecte o NaPista primeiro" }, { status: 409 });
}
