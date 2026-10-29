import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso, recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { parseDia } from "@/lib/guarda-financeiro";
import { ErroDeCategoria } from "@/lib/categorias-financeiras";
import { ErroDePagar } from "@/lib/contas-pagar";
import { ErroDeNota, importarNota, previaDaNota } from "@/lib/nfe-importar";

const MAX_XML = 2_000_000;
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ler"), xml: z.string().min(1).max(MAX_XML) }),
  z.object({
    acao: z.literal("importar"),
    xml: z.string().min(1).max(MAX_XML),
    itens: z.array(z.object({ n: z.number().int().min(1), productId: z.string().min(1), quantidade: z.number().int().min(1).max(1_000_000) })).max(990),
    contaPagar: z
      .object({
        categoriaId: z.string().min(1).nullable(),
        parcelas: z.array(z.object({ vencimento: dia, valorCents: z.number().int().min(1) })).min(1).max(60),
      })
      .nullable(),
  }),
]);

/**
 * Importação do XML da nota de compra (reunião Believe, 29/10).
 * acao=ler: lê a nota e sugere o produto de cada item.
 * acao=importar: dá entrada no estoque e, se pedido, lança no A pagar.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só o responsável e o financeiro lançam entrada no estoque" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "arquivo ou dados inválidos" }, { status: 400 });
  const d = parsed.data;

  try {
    if (d.acao === "ler") {
      const previa = await previaDaNota(user.tenantId, d.xml);
      const comFinanceiro = user.role === "SUPERADMIN" || (await recursosDoUsuario(user)).has("CONTAS_RECEBER");
      return NextResponse.json({ ...previa, comFinanceiro });
    }

    if (d.contaPagar && user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("CONTAS_RECEBER")) {
      return NextResponse.json({ error: "o financeiro não está ativo nesta empresa" }, { status: 403 });
    }
    const r = await importarNota(user.tenantId, user.id, {
      xml: d.xml,
      itens: d.itens,
      contaPagar: d.contaPagar
        ? { categoriaId: d.contaPagar.categoriaId, parcelas: d.contaPagar.parcelas.map((p) => ({ vencimento: parseDia(p.vencimento)!, valorCents: p.valorCents })) }
        : null,
    });
    await logAudit({ actor: user, action: "estoque.nfe_importada", metadata: r });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeNota || e instanceof ErroDeCategoria || e instanceof ErroDePagar) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
