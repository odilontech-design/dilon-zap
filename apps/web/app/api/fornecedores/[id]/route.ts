import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";

const schema = z.object({ nome: z.string().trim().min(1, "informe o nome do fornecedor").max(120) });

/**
 * Corrige o nome de um fornecedor. O nome vale para todas as contas dele, que
 * apontam para este cadastro: não se renomeia conta por conta.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "nome inválido" }, { status: 400 });
  const nome = parsed.data.nome;

  const atual = await prisma.fornecedor.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true, nome: true } });
  if (!atual) return NextResponse.json({ error: "fornecedor não encontrado" }, { status: 404 });

  // Mesma regra de achaOuCriaFornecedor: outra caixa de letra é o mesmo nome, e
  // dois cadastros iguais dividiriam a lista e os totais. Trocar só a caixa do
  // próprio nome ("maxiline" → "Maxiline") é permitido.
  const outro = await prisma.fornecedor.findFirst({
    where: { tenantId: user.tenantId, id: { not: atual.id }, nome: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (outro) return NextResponse.json({ error: "já existe outro fornecedor com esse nome" }, { status: 409 });

  const f = await prisma.fornecedor.update({ where: { id: atual.id }, data: { nome }, select: { id: true, nome: true } });
  await logAudit({ actor: user, action: "fornecedor.renomear", metadata: { fornecedorId: f.id, de: atual.nome, para: f.nome } });
  return NextResponse.json(f);
}
