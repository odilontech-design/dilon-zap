import { NextResponse } from "next/server";
import { z } from "zod";
import { autenticarPorChave } from "@/lib/api-key";
import { recursosDoTenant } from "@/lib/plano";
import { registrarBaixaDoSite } from "@/lib/estoque-do-site";

/**
 * POST /api/integracao/estoque — a loja online avisa uma venda paga (tipo VENDA) ou que ela foi desfeita
 * (tipo ESTORNO), e o estoque daqui baixa ou volta. Mesma chave `dz_...` da porta de mensagens.
 *
 * { "referencia": "believe-pedido-19", "tipo": "VENDA", "pedido": "#19",
 *   "itens": [{ "codigo": "mpremium-ouse-shampoo-300ml", "nome": "Shampoo Ouse", "quantidade": 2 }] }
 *
 * Idempotente pela referência: repetir devolve 200 com `duplicada: true` e não baixa de novo. Linha cujo código
 * ainda não está vinculado a um produto volta em `pendentes` e é baixada quando a gestão fizer o vínculo.
 */
const schema = z.object({
  referencia: z.string().trim().min(1).max(120),
  tipo: z.enum(["VENDA", "ESTORNO"]),
  pedido: z.string().trim().max(40).optional(),
  itens: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(120),
        nome: z.string().trim().min(1).max(200),
        quantidade: z.number().int().min(1).max(10_000),
      })
    )
    .max(200)
    .default([]),
});

export async function POST(req: Request) {
  const auth = await autenticarPorChave(req);
  if (!auth) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  if (!(await recursosDoTenant(auth.tenantId)).has("INTEGRACAO_API")) {
    return NextResponse.json({ error: "integração não faz parte do plano desta empresa", foraDoPlano: true }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.tipo === "VENDA" && parsed.data.itens.length === 0) {
    return NextResponse.json({ error: "venda sem itens" }, { status: 400 });
  }
  const r = await registrarBaixaDoSite(auth.tenantId, parsed.data);
  return NextResponse.json({ ok: true, ...r });
}
