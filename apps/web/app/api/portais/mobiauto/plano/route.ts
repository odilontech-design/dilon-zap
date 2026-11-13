import { NextResponse } from "next/server";
import { z } from "zod";
import { gestaoDosPortais } from "@/lib/portais-api";
import { definirPlanoMobiauto, planosMobiauto } from "@/lib/portais-mobiauto";

/** Os planos de publicação da loja na MobiAuto (ao vivo). */
export async function GET() {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  try {
    return NextResponse.json({ planos: (await planosMobiauto(user.tenantId)) ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a MobiAuto não respondeu" }, { status: 502 });
  }
}

/** Qual plano os carros usam por padrão. */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ plano: z.string().trim().min(1).max(60).nullable() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  await definirPlanoMobiauto(user.tenantId, parsed.data.plano);
  return NextResponse.json({ ok: true });
}
