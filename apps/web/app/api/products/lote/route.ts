import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { ehGerencia } from "@/lib/papeis";

const bodySchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("desativar"), ids: z.array(z.string()).min(1).max(500) }),
  z.object({ acao: z.literal("reativar"), ids: z.array(z.string()).min(1).max(500) }),
  z.object({
    acao: z.literal("categoria"),
    ids: z.array(z.string()).min(1).max(500),
    // Vazio tira a categoria
    categoria: z.string().trim().max(40),
  }),
]);

/**
 * POST /api/products/lote — ação em vários produtos de uma vez, a partir da
 * seleção na tela de Estoque. Mesma regra de quem edita o catálogo produto a
 * produto (gerência). Só alcança produtos da própria empresa: o filtro por
 * tenant vai junto no where, então um id de outra empresa simplesmente não
 * conta.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
  const body = parsed.data;

  const data =
    body.acao === "desativar"
      ? { isActive: false }
      : body.acao === "reativar"
        ? { isActive: true }
        : { categoria: body.categoria || null };

  const { count } = await prisma.product.updateMany({
    where: { id: { in: body.ids }, tenantId: user.tenantId },
    data,
  });

  await logAudit({
    actor: user,
    action: `product.lote.${body.acao}`,
    metadata: { quantidade: count, ids: body.ids, ...(body.acao === "categoria" ? { categoria: body.categoria } : {}) },
  });

  return NextResponse.json({ ok: true, atualizados: count });
}
