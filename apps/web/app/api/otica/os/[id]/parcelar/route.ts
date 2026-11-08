import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { ErroDeConta } from "@/lib/contas-receber";
import { parcelarSaldo } from "@/lib/otica-financeiro";
import { parcelarSchema } from "@/lib/otica-schemas";

/**
 * Crediário: divide o saldo que falta em parcelas. Só a gestão — é uma
 * decisão de crédito, não de balcão.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão parcela o saldo" }, { status: 403 });

  const parsed = parcelarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const r = await parcelarSaldo({
      tenantId: user.tenantId,
      ordemId: params.id,
      numParcelas: parsed.data.numParcelas,
      periodicidade: parsed.data.periodicidade,
      primeiroVencimento: new Date(`${parsed.data.primeiroVencimento}T12:00:00Z`),
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
