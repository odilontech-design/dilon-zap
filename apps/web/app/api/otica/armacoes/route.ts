import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ErroDeConta } from "@/lib/contas-receber";
import { criarArmacao, listarArmacoes } from "@/lib/otica-estoque";
import { armacaoSchema } from "@/lib/otica-schemas";

/**
 * Armações do estoque da ótica. `disponiveis=1` é o que a OS usa na escolha:
 * só o que ainda tem peça para vender.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const q = new URL(req.url).searchParams;
  const r = await listarArmacoes(user.tenantId, { q: q.get("q") ?? "", soDisponiveis: q.get("disponiveis") === "1", limite: Number(q.get("limite")) || 100 });
  return NextResponse.json(r);
}

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = armacaoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await criarArmacao(user.tenantId, parsed.data, user.id), { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
