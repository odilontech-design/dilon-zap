import { NextResponse } from "next/server";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";

/**
 * O portão do financeiro: recurso Contas a receber ligado na empresa E papel
 * de gestão. Devolve a resposta pronta, no padrão de exigirRecurso:
 * `if (bloqueio) return bloqueio`.
 *
 * Só responsável e financeiro: a lista mostra quanto cada cliente deve e o
 * caixa mostra o dinheiro da empresa — informação de gestão.
 */
export async function guardaFinanceiro(user: { tenantId: string; role: string }): Promise<NextResponse | null> {
  const bloqueio = await exigirRecurso(user, "CONTAS_RECEBER");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) {
    return NextResponse.json({ error: "só o responsável e o financeiro acessam o financeiro" }, { status: 403 });
  }
  return null;
}

/** "2026-10-10" → o dia ao meio-dia UTC (o fuso não empurra o vencimento). */
export function parseDia(texto: string | null | undefined): Date | undefined {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined;
  const d = new Date(`${texto}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Início do dia em Brasília, como instante UTC. */
export function inicioDoDiaBR(texto: string | null | undefined): Date | undefined {
  const d = parseDia(texto);
  return d ? new Date(`${texto}T03:00:00Z`) : undefined;
}

/** Último instante do dia em Brasília. */
export function fimDoDiaBR(texto: string | null | undefined): Date | undefined {
  const d = parseDia(texto);
  return d ? new Date(new Date(`${texto}T03:00:00Z`).getTime() + 86_400_000 - 1) : undefined;
}
