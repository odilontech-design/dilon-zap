import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { definirPlanoDoCarro, modalidadesWebmotors } from "@/lib/portais-webmotors";

/**
 * O plano (modalidade) deste carro na Webmotors. Nulo = o plano padrão da loja. Confere o plano na lista ao vivo da Webmotors
 * (e se ainda cabe), grava a escolha e o worker faz a troca no próximo ciclo. Só a gestão, só carros da loja.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 });
  const parsed = z.object({ codigo: z.string().regex(/^\d+$/).nullable() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  let modalidades;
  try {
    modalidades = parsed.data.codigo === null ? [] : await modalidadesWebmotors(user.tenantId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "a Webmotors não respondeu" }, { status: 502 });
  }
  if (!modalidades) return NextResponse.json({ error: "a Webmotors não está conectada" }, { status: 409 });
  const r = await definirPlanoDoCarro(user.tenantId, params.id, parsed.data.codigo, modalidades);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: r.status });
}
