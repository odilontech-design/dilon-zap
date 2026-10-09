import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { calcularLigacoes } from "@/lib/relatorio-ligacoes";

function data(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Relatório de ligações. Da gestão: mostra o desempenho de cada pessoa da
 * equipe, e isso não é para quem só atende.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê este relatório" }, { status: 403 });

  const q = new URL(req.url).searchParams;

  const [tarefas, usuarios] = await Promise.all([
    prisma.tarefaNegociacao.findMany({
      where: { tenantId: user.tenantId, tipo: "LIGACAO" },
      select: { id: true, negociacaoId: true, responsavelId: true, venceEm: true, concluidaEm: true, resultado: true },
    }),
    prisma.user.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Tarefa pendente de negociação já encerrada não é mais "atrasada": ninguém
  // vai ligar. Fica de fora das pendências, mas as concluídas seguem valendo.
  const encerradas = new Set(
    (
      await prisma.negociacao.findMany({
        where: { tenantId: user.tenantId, status: { not: "ABERTA" }, id: { in: [...new Set(tarefas.map((t) => t.negociacaoId))] } },
        select: { id: true },
      })
    ).map((n) => n.id)
  );
  const ligacoes = tarefas.filter((t) => t.concluidaEm || !encerradas.has(t.negociacaoId));

  const relatorio = calcularLigacoes({
    ligacoes,
    desde: data(q.get("desde")),
    ate: data(q.get("ate")),
    responsavelId: q.get("responsavelId") || undefined,
    agora: new Date(),
  });

  return NextResponse.json({ ...relatorio, usuarios });
}
