import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";
import { editarCategoria, ErroDeCategoria, removerCategoria } from "@/lib/categorias-financeiras";

const schema = z.object({
  grupo: z.string().trim().min(1).max(60).optional(),
  nome: z.string().trim().min(1).max(80).optional(),
  ativa: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  try {
    const c = await editarCategoria(user.tenantId, params.id, parsed.data);
    await logAudit({ actor: user, action: "categoria_financeira.editada", metadata: { categoriaId: params.id, ...parsed.data } });
    return NextResponse.json(c);
  } catch (e) {
    if (e instanceof ErroDeCategoria) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** Apaga se nunca foi usada; se já foi, desativa. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;
  try {
    const r = await removerCategoria(user.tenantId, params.id);
    await logAudit({ actor: user, action: "categoria_financeira.removida", metadata: { categoriaId: params.id, ...r } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeCategoria) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
