import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * Atendente lê o catálogo (vai precisar pra montar pedido). Cadastrar e
 * mudar preço é do Responsável e do Financeiro — quem negocia valor com o
 * cliente é o financeiro, então prendê-lo fora da tabela criaria uma volta
 * inútil pelo Responsável toda vez que um preço muda.
 *
 * A consultora continua de fora: preço é decisão da empresa, e se cada
 * atendente puder editar deixa de existir tabela.
 */
function podeEditarCatalogo(role: string) {
  return role === "OWNER" || role === "FINANCEIRO";
}
export async function GET(req: Request) {
  const user = await requireUser();
  const incluirInativos = new URL(req.url).searchParams.get("incluirInativos") === "1";

  const produtos = await prisma.product.findMany({
    where: { tenantId: user.tenantId, ...(incluirInativos ? {} : { isActive: true }) },
    orderBy: [{ categoria: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(produtos);
}

const criarSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(40).optional(),
  categoria: z.string().trim().max(40).optional(),
  // Recebe em centavos: a conversão de "19,90" pra 1990 é feita na tela, num
  // lugar só, e a API nunca vê número quebrado.
  priceCents: z.number().int().min(0),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!podeEditarCatalogo(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, sku, categoria, priceCents } = parsed.data;

  try {
    const criado = await prisma.product.create({
      // sku e categoria vazios viram null: string vazia colidiria no unique
      // com todos os outros produtos sem código.
      data: {
        tenantId: user.tenantId,
        name,
        sku: sku || null,
        categoria: categoria || null,
        priceCents,
      },
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "já existe um produto com esse nome ou código" }, { status: 409 });
    }
    throw err;
  }
}
