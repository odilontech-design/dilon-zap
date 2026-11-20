import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { z } from "zod";
import { definirPlanoPadrao, modalidadesWebmotors } from "@/lib/portais-webmotors";

async function gestao() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 }) };
  return { user };
}

/** Os planos de anúncio do pacote da loja na Webmotors (ao vivo). */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  try {
    return NextResponse.json({ modalidades: (await modalidadesWebmotors(user.tenantId)) ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a Webmotors não respondeu" }, { status: 502 });
  }
}

/** Qual plano (modalidade) os carros usam por padrão. */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ codigo: z.string().regex(/^\d+$/).nullable() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  await definirPlanoPadrao(user.tenantId, parsed.data.codigo);
  return NextResponse.json({ ok: true });
}
