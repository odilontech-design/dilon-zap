import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { ehGerencia } from "@/lib/papeis";
import { ErroDeEstoqueDoSite, vincularCodigoDoSite } from "@/lib/estoque-do-site";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().max(40).optional(),
  categoria: z.string().trim().max(40).optional(),
  priceCents: z.number().int().min(0).optional(),
  // Valor de compra (custo unitário). Nulo limpa.
  custoCents: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  tipo: z.enum(["PRODUTO", "SERVICO"]).optional(),
  cobranca: z.enum(["UNICA", "MENSAL"]).optional(),
  duracaoMinutos: z.number().int().min(1).max(24 * 60).nullable().optional(),
  // Texto longo de referência (protocolo, indicação, cuidados). Vazio limpa.
  descricao: z.string().trim().max(4000).optional(),
  // Código do produto na loja online (vínculo da baixa de estoque das vendas do site). Vazio limpa.
  codigoSite: z.string().trim().max(120).optional(),
});

// Responsável e Financeiro editam o catálogo, inclusive preço. Ver o
// comentário em ../route.ts.
function podeEditarCatalogo(role: string) {
  return ehGerencia(role);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!podeEditarCatalogo(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Filtra pelo tenant junto com o id: sem isso, chutar um id alcançaria
  // produto de outra empresa.
  const alvo = await prisma.product.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { sku, categoria, descricao, codigoSite, ...resto } = parsed.data;

  try {
    // O vínculo com o site primeiro e pela porta própria: ele baixa as vendas do site que esperavam este código.
    let baixadasAgora = 0;
    if (codigoSite !== undefined && (codigoSite || null) !== (alvo.codigoSite ?? null)) {
      baixadasAgora = (await vincularCodigoDoSite(user.tenantId, alvo.id, codigoSite || null, user.id)).baixadasAgora;
    }
    const atualizado = await prisma.product.update({
      where: { id: alvo.id },
      data: {
        ...resto,
        ...(sku !== undefined ? { sku: sku || null } : {}),
        ...(categoria !== undefined ? { categoria: categoria || null } : {}),
        ...(descricao !== undefined ? { descricao: descricao || null } : {}),
      },
    });
    return NextResponse.json({ ...atualizado, baixadasAgora });
  } catch (err: unknown) {
    if (err instanceof ErroDeEstoqueDoSite) return NextResponse.json({ error: err.message }, { status: err.status });
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "já existe um produto com esse nome ou código" }, { status: 409 });
    }
    throw err;
  }
}

/**
 * Excluir de verdade — Desativar continua sendo o caminho recomendado pro
 * dia a dia (some dos seletores, sem perder nada), mas às vezes o cadastro
 * foi criado errado (importação duplicada, teste, nome trocado) e "inativo
 * pra sempre" só suja a lista.
 *
 * É seguro porque OrderItem guarda o nome e os valores praticados NO
 * MOMENTO da venda (nomeProduto, precoTabelaCents, precoUnitCents) e aponta
 * pra cá com onDelete: SetNull — um pedido antigo não perde o que foi vendido,
 * só o link pro cadastro (que pode nem existir mais mesmo, sem excluir:
 * mudar de tenant, reimportar). Estoque (StockMovement) e a biblioteca
 * (ProdutoMaterial) vão junto por Cascade — são histórico DESTE produto, não
 * de um pedido.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["PEDIDOS", "MATERIAIS"]);
  if (bloqueio) return bloqueio;
  if (!podeEditarCatalogo(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const alvo = await prisma.product.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.product.delete({ where: { id: alvo.id } });

  await logAudit({ actor: user, action: "product.delete", metadata: { productId: alvo.id, nome: alvo.name } });

  return NextResponse.json({ ok: true });
}
