import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ErroDeConta } from "@/lib/contas-receber";
import { receberDaOS } from "@/lib/otica-financeiro";
import { receberSchema } from "@/lib/otica-schemas";

/**
 * Recebe dinheiro da venda no balcão: o saldo, ou uma parte. Entra no Caixa
 * do dia e abate as parcelas da conta a receber, da mais antiga para a mais nova.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = receberSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const r = await receberDaOS({ tenantId: user.tenantId, ordemId: params.id, valorCents: parsed.data.valorCents, meio: parsed.data.meio, userId: user.id });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
