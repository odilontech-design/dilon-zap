import { NextResponse } from "next/server";
import { z } from "zod";
import { gestaoDosPortais } from "@/lib/portais-api";
import { definirLojaMobiauto, lojasMobiauto } from "@/lib/portais-mobiauto";

/** As lojas (dealers) que o usuário autorizado gerencia no Mobigestor. */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  try {
    return NextResponse.json({ lojas: (await lojasMobiauto(user.tenantId)) ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a MobiAuto não respondeu" }, { status: 502 });
  }
}

/** Troca a loja usada pelo Zap (quando o usuário gerencia mais de uma). */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ dealerId: z.string().regex(/^\d+$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  return (await definirLojaMobiauto(user.tenantId, parsed.data.dealerId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "conecte a MobiAuto primeiro" }, { status: 409 });
}
