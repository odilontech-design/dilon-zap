import { NextResponse } from "next/server";
import { z } from "zod";
import { autenticarPorChave } from "@/lib/api-key";
import { recursosDoTenant } from "@/lib/plano";
import { ErroDeVendaDoSite, estornarVendaDoSite, registrarVendaDoSite } from "@/lib/venda-do-site";

/**
 * POST /api/integracao/vendas — a loja online avisa uma venda paga (tipo VENDA) ou que ela foi desfeita
 * (tipo ESTORNO), e o dinheiro entra (ou volta) no Financeiro daqui. Mesma chave `dz_...` das outras portas.
 *
 * { "referencia": "believe-pedido-19", "tipo": "VENDA", "pedido": "#19",
 *   "cliente": { "nome": "Maria", "telefone": "5521999999999" },
 *   "itens": [{ "codigo": "mpremium-ouse-shampoo-300ml", "nome": "Shampoo Ouse", "quantidade": 2, "precoUnitCents": 4590 }],
 *   "freteCents": 1500, "descontoCents": 500, "totalCents": 10180, "meio": "PIX", "pagoEm": "2026-11-18T14:00:00Z" }
 *
 * ESTORNO só precisa de { referencia, tipo, pedido }. Idempotente pela referência. O estoque NÃO é tratado aqui:
 * continua em /api/integracao/estoque (ver lib/venda-do-site.ts).
 */
const venda = z.object({
  referencia: z.string().trim().min(1).max(120),
  tipo: z.literal("VENDA"),
  pedido: z.string().trim().max(40).optional(),
  cliente: z.object({ nome: z.string().trim().min(1).max(200), telefone: z.string().trim().min(10).max(20) }),
  itens: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(120),
        nome: z.string().trim().min(1).max(200),
        quantidade: z.number().int().min(1).max(10_000),
        precoUnitCents: z.number().int().min(0).max(100_000_000),
      })
    )
    .min(1)
    .max(200),
  freteCents: z.number().int().min(0).max(100_000_000).default(0),
  descontoCents: z.number().int().min(0).max(100_000_000).default(0),
  totalCents: z.number().int().min(0).max(1_000_000_000),
  meio: z.enum(["PIX", "CARTAO", "BOLETO"]),
  pagoEm: z.string().datetime().optional(),
});
const estorno = z.object({
  referencia: z.string().trim().min(1).max(120),
  tipo: z.literal("ESTORNO"),
  pedido: z.string().trim().max(40).optional(),
});
const schema = z.discriminatedUnion("tipo", [venda, estorno]);

export async function POST(req: Request) {
  const auth = await autenticarPorChave(req);
  if (!auth) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  if (!(await recursosDoTenant(auth.tenantId)).has("INTEGRACAO_API")) {
    return NextResponse.json({ error: "integração não faz parte do plano desta empresa", foraDoPlano: true }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const b = parsed.data;
    if (b.tipo === "ESTORNO") {
      return NextResponse.json({ ok: true, ...(await estornarVendaDoSite(auth.tenantId, b.referencia, b.pedido?.trim() || null)) });
    }
    const r = await registrarVendaDoSite(auth.tenantId, { ...b, pagoEm: b.pagoEm ? new Date(b.pagoEm) : null });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErroDeVendaDoSite) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[vendas] erro ao registrar venda do site:", e);
    return NextResponse.json({ error: "erro ao registrar a venda" }, { status: 500 });
  }
}
