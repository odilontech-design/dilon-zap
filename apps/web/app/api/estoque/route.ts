import { NextResponse } from "next/server";
import type { StockMovementType } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { fimDoDiaBR, inicioDoDiaBR } from "@/lib/guarda-financeiro";
import {
  csvDoResumo,
  csvDosMovimentos,
  movimentosDoEstoque,
  resumoDoEstoque,
  ROTULO_TIPO_MOV,
} from "@/lib/estoque-relatorio";

/**
 * GET /api/estoque?visao=resumo|movimentos&de=AAAA-MM-DD&ate=AAAA-MM-DD
 *   [&produto=<id>][&tipo=VENDA][&formato=csv]
 *
 * Relatório de estoque do período. Gestão (responsável e financeiro), como o
 * resto do estoque: a consultora vê o saldo no catálogo, não o histórico.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só o responsável e o financeiro" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const deTexto = q.get("de");
  const ateTexto = q.get("ate");
  const de = inicioDoDiaBR(deTexto);
  const ate = fimDoDiaBR(ateTexto);
  if (!de || !ate || de > ate) return NextResponse.json({ error: "período inválido" }, { status: 400 });

  const productId = q.get("produto") || undefined;
  const tipoBruto = q.get("tipo");
  const tipo = tipoBruto && tipoBruto in ROTULO_TIPO_MOV ? (tipoBruto as StockMovementType) : undefined;
  const csv = q.get("formato") === "csv";
  const periodo = { de, ate };

  if (q.get("visao") === "movimentos") {
    const r = await movimentosDoEstoque(user.tenantId, periodo, { productId, tipo });
    if (csv) return arquivo(csvDosMovimentos(r.linhas), `estoque-movimentacoes-${deTexto}-a-${ateTexto}.csv`);
    return NextResponse.json(r);
  }

  const linhas = await resumoDoEstoque(user.tenantId, periodo, productId);
  if (csv) return arquivo(csvDoResumo(linhas), `estoque-resumo-${deTexto}-a-${ateTexto}.csv`);
  return NextResponse.json({ linhas });
}

function arquivo(conteudo: string, nome: string) {
  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
