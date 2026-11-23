import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { fimDoDia, inicioDoDia, type FiltrosDoHistorico } from "@/lib/otica-historico";
import { montarHistoricoDeOS } from "@/lib/otica-historico-servidor";

function escolha<T extends string>(valor: string | null, aceitos: readonly T[], padrao: T): T {
  return aceitos.includes(valor as T) ? (valor as T) : padrao;
}

/** Histórico das OS (entregues e canceladas, inclusive as do papel) com filtros e indicadores. */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const p = new URL(req.url).searchParams;
  const filtros: FiltrosDoHistorico = {
    de: inicioDoDia(p.get("de")),
    ate: fimDoDia(p.get("ate")),
    situacao: escolha(p.get("situacao"), ["todas", "entregues", "canceladas"], "todas"),
    laboratorioId: p.get("laboratorioId") || undefined,
    consultorId: p.get("consultorId") || undefined,
    origem: escolha(p.get("origem"), ["todas", "papel", "sistema"], "todas"),
    financeiro: escolha(p.get("financeiro"), ["todas", "quitadas", "com-saldo", "sem-lancamento"], "todas"),
  };

  return NextResponse.json(await montarHistoricoDeOS(user.tenantId, filtros, p.get("datas") === "suspeitas"), { headers: { "Cache-Control": "no-store" } });
}
