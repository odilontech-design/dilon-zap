import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ehGerencia } from "@/lib/papeis";
import { excluirContatosEmLote, LIMITE_LOTE } from "@/lib/contatos-lote";

const bodySchema = z.object({
  acao: z.literal("excluir"),
  ids: z.array(z.string()).min(1).max(LIMITE_LOTE),
});

/**
 * POST /api/contacts/lote — ação em vários contatos de uma vez, a partir da
 * seleção na página Contatos. Só a gerência: apagar contato leva junto as
 * conversas dele, e em lote o estrago de um engano é grande.
 *
 * Quem tem pedido, conta a receber, negociação ou conversa aberta nunca é
 * apagado por aqui (ver lib/contatos-lote.ts); volta em `ignorados`.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  const r = await excluirContatosEmLote(user.tenantId, parsed.data.ids);

  await logAudit({
    actor: user,
    action: "contact.lote.excluir",
    metadata: { pedidos: parsed.data.ids.length, excluidos: r.excluidos, ignorados: r.ignorados.length },
  });

  return NextResponse.json(r);
}
