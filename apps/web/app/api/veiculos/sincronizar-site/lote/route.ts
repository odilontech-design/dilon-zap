import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { baixarEmLote, reativarEmLote } from "@/lib/espelho-do-site";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.object({ acao: z.enum(["baixar", "reativar"]), ids: z.array(z.string().min(1).max(40)).min(1).max(100) });

/**
 * Ação em lote sobre os carros que saíram do site antigo e esperam confirmação: "baixar" (vendidos, sem
 * registrar a venda agora) ou "reativar" (foi engano, continuam à venda). Só a gestão, sempre da loja da sessão.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "escolha a ação e pelo menos um carro" }, { status: 400 });
  const entrada = { tenantId: user.tenantId, userId: user.id, ids: parsed.data.ids };
  if (parsed.data.acao === "baixar") {
    const r = await baixarEmLote(entrada);
    await logAudit({ actor: user, action: "veiculos.baixa-em-lote", metadata: { pedidos: parsed.data.ids.length, baixados: r.baixados, ignorados: r.ignorados.length } });
    return NextResponse.json(r);
  }
  const r = await reativarEmLote(entrada);
  await logAudit({ actor: user, action: "veiculos.reativar-em-lote", metadata: { pedidos: parsed.data.ids.length, reativados: r.reativados } });
  return NextResponse.json(r);
}
