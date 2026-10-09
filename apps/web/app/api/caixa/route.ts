import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";
import { abrirCaixa, caixaAberto, dadosDoCaixa, ErroDeCaixa, historicoDeCaixas } from "@/lib/caixa";

/** O caixa aberto (com o que já entrou) e o histórico dos anteriores. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const aberto = await caixaAberto(user.tenantId);
  const [atual, historico] = await Promise.all([aberto ? dadosDoCaixa(user.tenantId, aberto.id) : null, historicoDeCaixas(user.tenantId)]);
  return NextResponse.json({ atual, historico });
}

const schema = z.object({ valorInicialCents: z.number().int().min(0).max(10_000_000_000).default(0) });

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "valor inicial inválido" }, { status: 400 });

  try {
    const caixa = await abrirCaixa(user.tenantId, user.id, parsed.data.valorInicialCents);
    await logAudit({ actor: user, action: "caixa.aberto", metadata: { caixaId: caixa.id, valorInicialCents: parsed.data.valorInicialCents } });
    return NextResponse.json(caixa, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeCaixa) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
