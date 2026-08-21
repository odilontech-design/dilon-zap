import Link from "next/link";
import { formatarReais } from "@dilon-zap/esquadrias-core";
import { prisma } from "@dilon-zap/erp-db";
import { Card, Etiqueta, Indicador, TituloPagina, Vazio } from "@/components/ui";
import { requireUsuario } from "@/lib/session";
import { vePreco } from "@/lib/papeis";
import { temRecurso } from "@/lib/planos";

export const dynamic = "force-dynamic";

const TOM_STATUS = {
  RASCUNHO: "neutro",
  ENVIADO: "azul",
  APROVADO: "verde",
  REPROVADO: "vermelho",
  EXPIRADO: "amarelo",
} as const;

export default async function PainelPage() {
  const usuario = await requireUsuario();
  const empresaId = usuario.empresaId;

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioProximoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);

  const [doMes, aprovadosMes, obrasAbertas, aReceber, vencidos, ultimos, ranking] = await Promise.all([
    prisma.orcamento.aggregate({
      where: { empresaId, criadoEm: { gte: inicioMes, lt: inicioProximoMes } },
      _count: true,
      _sum: { totalCentavos: true },
    }),
    prisma.orcamento.aggregate({
      where: { empresaId, status: "APROVADO", aprovadoEm: { gte: inicioMes, lt: inicioProximoMes } },
      _count: true,
      _sum: { totalCentavos: true, lucroCentavos: true },
    }),
    prisma.obra.count({ where: { empresaId, status: { notIn: ["CONCLUIDA", "CANCELADA"] } } }),
    prisma.lancamento.aggregate({
      where: { empresaId, tipo: "RECEITA", status: "PENDENTE" },
      _sum: { valorCentavos: true },
    }),
    prisma.lancamento.count({ where: { empresaId, status: "PENDENTE", vencimento: { lt: agora } } }),
    prisma.orcamento.findMany({
      where: { empresaId },
      include: { cliente: { select: { nome: true } } },
      orderBy: { criadoEm: "desc" },
      take: 8,
    }),
    prisma.orcamento.groupBy({
      by: ["vendedorId"],
      where: { empresaId, status: "APROVADO", aprovadoEm: { gte: inicioMes, lt: inicioProximoMes } },
      _sum: { totalCentavos: true },
      _count: true,
    }),
  ]);

  // Taxa de conversão do mês: é o número que diz se o problema está em vender
  // ou em precificar. Sem denominador não existe taxa — mês sem orçamento
  // mostra "—" em vez de 0%, que leria como "ninguém fechou nada".
  const conversao = doMes._count > 0 ? Math.round((aprovadosMes._count / doMes._count) * 100) : null;

  const vendedores = await prisma.usuario.findMany({
    where: { id: { in: ranking.map((r) => r.vendedorId).filter((v): v is string => Boolean(v)) } },
    select: { id: true, nome: true },
  });
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

  const mostrarValores = vePreco(usuario.papel);

  return (
    <>
      <TituloPagina
        titulo={`Olá, ${usuario.name.split(" ")[0]}`}
        descricao={`Resumo de ${agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Indicador rotulo="Orçamentos no mês" valor={String(doMes._count)} detalhe={mostrarValores ? formatarReais(doMes._sum.totalCentavos ?? 0) : undefined} />
        <Indicador
          rotulo="Aprovados"
          valor={String(aprovadosMes._count)}
          detalhe={conversao === null ? "sem orçamentos ainda" : `${conversao}% de conversão`}
          tom="verde"
        />
        <Indicador rotulo="Obras em andamento" valor={String(obrasAbertas)} />
        {mostrarValores && temRecurso(usuario.plano, "FINANCEIRO") ? (
          <Indicador
            rotulo="A receber"
            valor={formatarReais(aReceber._sum.valorCentavos ?? 0)}
            detalhe={vencidos > 0 ? `${vencidos} vencido(s)` : "nenhum vencido"}
            tom={vencidos > 0 ? "vermelho" : "neutro"}
          />
        ) : (
          <Indicador rotulo="Faturamento aprovado" valor={mostrarValores ? formatarReais(aprovadosMes._sum.totalCentavos ?? 0) : "—"} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h2 className="font-medium text-neutral-900">Últimos orçamentos</h2>
            <Link href="/orcamentos" className="text-sm text-accent hover:underline">
              ver todos
            </Link>
          </div>

          {ultimos.length === 0 ? (
            <Vazio
              titulo="Nenhum orçamento ainda"
              descricao="Comece criando o primeiro. As tipologias já vêm prontas — é só escolher e informar as medidas do vão."
            />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {ultimos.map((o) => (
                <li key={o.id}>
                  <Link href={`/orcamentos/${o.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        #{o.numero} · {o.titulo}
                      </p>
                      <p className="truncate text-xs text-neutral-500">{o.cliente?.nome ?? "sem cliente"}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {mostrarValores && <span className="text-sm text-neutral-700">{formatarReais(o.totalCentavos)}</span>}
                      <Etiqueta tom={TOM_STATUS[o.status]}>{o.status.toLowerCase()}</Etiqueta>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="px-4 py-3 border-b border-neutral-200">
            <h2 className="font-medium text-neutral-900">Ranking do mês</h2>
          </div>

          {ranking.length === 0 ? (
            <Vazio titulo="Sem vendas aprovadas" descricao="O ranking aparece quando o primeiro orçamento do mês for aprovado." />
          ) : (
            <ol className="divide-y divide-neutral-200">
              {ranking
                .sort((a, b) => (b._sum.totalCentavos ?? 0) - (a._sum.totalCentavos ?? 0))
                .map((r, i) => (
                  <li key={r.vendedorId ?? i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-6 w-6 shrink-0 rounded-full bg-neutral-100 grid place-items-center text-xs text-neutral-600">{i + 1}</span>
                      <span className="truncate text-sm text-neutral-900">{nomePorId.get(r.vendedorId ?? "") ?? "sem vendedor"}</span>
                    </span>
                    <span className="shrink-0 text-sm text-neutral-700">
                      {mostrarValores ? formatarReais(r._sum.totalCentavos ?? 0) : `${r._count} venda(s)`}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
