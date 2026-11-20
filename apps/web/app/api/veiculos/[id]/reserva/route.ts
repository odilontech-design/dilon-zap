import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { cancelarVendaSchema, reservaSchema } from "@/lib/veiculos-schemas";
import { cancelarReserva, reservar, resolverCliente } from "@/lib/veiculos";
import { respostaDeErro } from "@/lib/veiculos-api";

/** Reserva o carro para um cliente (com ou sem sinal). Qualquer vendedor pode. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const parsed = reservaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const contactId = await resolverCliente(user.tenantId, parsed.data);
    const r = await reservar({ tenantId: user.tenantId, userId: user.id, veiculoId: params.id, contactId, dados: parsed.data });
    await logAudit({ actor: user, action: "veiculo.reserva", metadata: { veiculoId: params.id, sinalCents: parsed.data.sinalCents ?? 0 } });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}

/** Cancela a reserva, devolvendo ou não o sinal. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const parsed = cancelarVendaSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const r = await cancelarReserva({ tenantId: user.tenantId, userId: user.id, veiculoId: params.id, motivo: parsed.data.motivo, devolverSinal: parsed.data.devolverSinal === true });
    await logAudit({ actor: user, action: "veiculo.reserva.cancelar", metadata: { veiculoId: params.id, devolverSinal: parsed.data.devolverSinal === true } });
    return NextResponse.json(r);
  } catch (e) {
    return respostaDeErro(e);
  }
}
