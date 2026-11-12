import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { ErroPlanilhaAutoCerto, completarComPlanilha } from "@/lib/importar-autocerto-estoque";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.object({ texto: z.string().min(50).max(12_000_000), simular: z.boolean() });

/**
 * Completa as fichas já importadas (do site) com a planilha de estoque do
 * AutoCerto: placa, preço, FIPE, data de entrada. Em dois tempos: `simular`
 * mostra o que seria preenchido; gravar preenche só o que está vazio. Só a gestão.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "envie o conteúdo da planilha do AutoCerto" }, { status: 400 });
  try {
    const r = await completarComPlanilha({ tenantId: user.tenantId, userId: user.id, texto: parsed.data.texto, simular: parsed.data.simular });
    if (!parsed.data.simular) await logAudit({ actor: user, action: "veiculos.completar-autocerto", metadata: { aplicados: r.aplicados, casados: r.casados } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroPlanilhaAutoCerto) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
