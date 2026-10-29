import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";
import { criarCategoria, ErroDeCategoria, listarCategorias } from "@/lib/categorias-financeiras";

/** O plano de contas da empresa (criado na primeira leitura). */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;
  return NextResponse.json({ categorias: await listarCategorias(user.tenantId) });
}

const schema = z.object({
  tipo: z.enum(["RECEITA", "DESPESA"]),
  grupo: z.string().trim().min(1).max(60),
  nome: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "informe o tipo, o grupo e o nome" }, { status: 400 });
  try {
    const c = await criarCategoria(user.tenantId, parsed.data);
    await logAudit({ actor: user, action: "categoria_financeira.criada", metadata: { categoriaId: c.id, ...parsed.data } });
    return NextResponse.json(c, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeCategoria) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
