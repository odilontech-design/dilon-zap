import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ErroDeConta } from "@/lib/contas-receber";
import { ajustarQuantidade, editarArmacao } from "@/lib/otica-estoque";
import { editarArmacaoSchema } from "@/lib/otica-schemas";

/** Edita os dados, desativa, ou ajusta a quantidade (contagem) de uma armação. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = editarArmacaoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { novaQuantidade, motivo, ...dados } = parsed.data;
  try {
    const temDados = Object.values(dados).some((v) => v !== undefined);
    const armacao = temDados ? await editarArmacao(user.tenantId, params.id, dados) : null;
    const saldo = novaQuantidade !== undefined ? await ajustarQuantidade(user.tenantId, params.id, novaQuantidade, motivo ?? null, user.id) : null;
    return NextResponse.json({ ok: true, armacao, ...saldo });
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
