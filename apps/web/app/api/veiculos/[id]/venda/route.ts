import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { vendaSchema } from "@/lib/veiculos-schemas";
import { resolverCliente, vender } from "@/lib/veiculos";
import { respostaDeErro } from "@/lib/veiculos-api";

/**
 * Fecha a venda: direta, ou concluindo a reserva (`daReserva: true`). Gera a
 * conta a receber, põe a troca no estoque e, no consignado, o repasse ao dono.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const parsed = vendaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const contactId = "daReserva" in parsed.data ? null : await resolverCliente(user.tenantId, parsed.data);
    const r = await vender({ tenantId: user.tenantId, userId: user.id, veiculoId: params.id, contactId, dados: parsed.data });
    await logAudit({ actor: user, action: "veiculo.venda", metadata: { veiculoId: params.id, precoCents: parsed.data.precoCents, trocaId: r.trocaId } });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
