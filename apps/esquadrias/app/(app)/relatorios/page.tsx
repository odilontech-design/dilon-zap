import { formatarM2, formatarReais } from "@dilon-zap/esquadrias-core";
import { prisma } from "@dilon-zap/erp-db";
import { Card, Indicador, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { requireRecurso } from "@/lib/session";
import { lerMemoria } from "@/lib/calculo";
import { SeletorPeriodo } from "./seletor-periodo";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage({ searchParams }: { searchParams: { meses?: string } }) {
  const usuario = await requireRecurso("RELATORIOS");
  const meses = Math.min(24, Math.max(1, Number(searchParams.meses) || 6));

  const fim = new Date();
  const inicio = new Date(fim.getFullYear(), fim.getMonth() - (meses - 1), 1);

  const [orcamentos, aprovados, itens, metas] = await Promise.all([
    prisma.orcamento.findMany({
      where: { empresaId: usuario.empresaId, criadoEm: { gte: inicio } },
      select: { id: true, status: true, criadoEm: true, aprovadoEm: true, totalCentavos: true, custoCentavos: true, lucroCentavos: true, vendedorId: true },
    }),
    prisma.orcamento.findMany({
      where: { empresaId: usuario.empresaId, status: "APROVADO", aprovadoEm: { gte: inicio } },
      select: { id: true, aprovadoEm: true, totalCentavos: true, lucroCentavos: true, vendedorId: true, vendedor: { select: { nome: true } } },
    }),
    prisma.orcamentoItem.findMany({
      where: { orcamento: { empresaId: usuario.empresaId, status: "APROVADO", aprovadoEm: { gte: inicio } } },
      select: { quantidade: true, memoriaCalculo: true, totalCentavos: true, tipologia: { select: { nome: true } } },
    }),
    prisma.metaVenda.findMany({
      where: { empresaId: usuario.empresaId, competencia: { gte: new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1)) } },
      include: { usuario: { select: { nome: true } } },
    }),
  ]);

  const enviados = orcamentos.filter((o) => o.status !== "RASCUNHO");
  const conversao = enviados.length > 0 ? Math.round((aprovados.length / enviados.length) * 100) : null;
  const faturamento = aprovados.reduce((a, o) => a + o.totalCentavos, 0);
  const lucro = aprovados.reduce((a, o) => a + o.lucroCentavos, 0);
  const ticket = aprovados.length > 0 ? Math.round(faturamento / aprovados.length) : 0;

  // Faturamento por mês de APROVAÇÃO, não de criação: o mês em que o dinheiro
  // foi ganho é aquele em que o cliente disse sim.
  const porMes = new Map<string, number>();
  for (let i = 0; i < meses; i++) {
    const d = new Date(fim.getFullYear(), fim.getMonth() - (meses - 1 - i), 1);
    porMes.set(d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), 0);
  }
  for (const o of aprovados) {
    if (!o.aprovadoEm) continue;
    const chave = new Date(o.aprovadoEm).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    if (porMes.has(chave)) porMes.set(chave, (porMes.get(chave) ?? 0) + o.totalCentavos);
  }
  const maiorMes = Math.max(1, ...porMes.values());

  const porTipologia = new Map<string, { quantidade: number; totalCentavos: number; areaM2: number }>();
  for (const item of itens) {
    const nome = item.tipologia?.nome ?? "Sem tipologia";
    const memoria = lerMemoria(item.memoriaCalculo);
    const atual = porTipologia.get(nome) ?? { quantidade: 0, totalCentavos: 0, areaM2: 0 };
    atual.quantidade += item.quantidade;
    atual.totalCentavos += item.totalCentavos;
    atual.areaM2 += memoria?.expansao.areaTotalM2 ?? 0;
    porTipologia.set(nome, atual);
  }

  const porVendedor = new Map<string, { nome: string; total: number; quantidade: number }>();
  for (const o of aprovados) {
    const chave = o.vendedorId ?? "sem";
    const atual = porVendedor.get(chave) ?? { nome: o.vendedor?.nome ?? "Sem vendedor", total: 0, quantidade: 0 };
    atual.total += o.totalCentavos;
    atual.quantidade += 1;
    porVendedor.set(chave, atual);
  }

  return (
    <>
      <TituloPagina titulo="Relatórios" descricao={`Últimos ${meses} meses.`} acao={<SeletorPeriodo meses={meses} />} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Faturamento aprovado" valor={formatarReais(faturamento)} detalhe={`${aprovados.length} venda(s)`} tom="verde" />
        <Indicador rotulo="Taxa de conversão" valor={conversao === null ? "—" : `${conversao}%`} detalhe={`${enviados.length} orçamento(s) enviados`} />
        <Indicador rotulo="Ticket médio" valor={formatarReais(ticket)} />
        <Indicador
          rotulo="Margem média"
          valor={faturamento > 0 ? `${((lucro / faturamento) * 100).toFixed(1)}%` : "—"}
          detalhe={`lucro de ${formatarReais(lucro)}`}
          tom={faturamento > 0 && lucro / faturamento < 0.15 ? "vermelho" : "neutro"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-4 font-medium text-neutral-900">Faturamento por mês</h2>
          {/* Barras em CSS puro: um gráfico aqui carregaria uma biblioteca
              inteira pra desenhar seis retângulos. */}
          <ul className="space-y-2">
            {[...porMes.entries()].map(([mes, valor]) => (
              <li key={mes} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-neutral-500">{mes}</span>
                <span className="h-5 flex-1 overflow-hidden rounded bg-neutral-100">
                  <span className="block h-full rounded bg-accent/60" style={{ width: `${(valor / maiorMes) * 100}%` }} />
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-neutral-700">{formatarReais(valor)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="border-b border-neutral-200 px-4 py-3 font-medium text-neutral-900">Vendedores</h2>
          {porVendedor.size === 0 ? (
            <Vazio titulo="Sem vendas no período" />
          ) : (
            <Tabela cabecalho={["Vendedor", "Vendas", "Total", "Meta do mês"]}>
              {[...porVendedor.values()]
                .sort((a, b) => b.total - a.total)
                .map((v) => {
                  const meta = metas.find((m) => m.usuario.nome === v.nome);
                  const atingimento = meta && meta.metaCentavos > 0 ? Math.round((v.total / meta.metaCentavos) * 100) : null;
                  return (
                    <tr key={v.nome}>
                      <td className="px-4 py-3 font-medium text-neutral-900">{v.nome}</td>
                      <td className="px-4 py-3 text-neutral-700">{v.quantidade}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatarReais(v.total)}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {meta ? (
                          <>
                            {formatarReais(meta.metaCentavos)}
                            {atingimento !== null && (
                              <span className={`ml-2 text-xs ${atingimento >= 100 ? "text-emerald-600" : "text-neutral-500"}`}>{atingimento}%</span>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-400">sem meta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </Tabela>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="border-b border-neutral-200 px-4 py-3 font-medium text-neutral-900">Tipologias mais vendidas</h2>
          {porTipologia.size === 0 ? (
            <Vazio titulo="Nenhuma venda aprovada no período" />
          ) : (
            <Tabela cabecalho={["Tipologia", "Unidades", "Área total", "Faturamento"]}>
              {[...porTipologia.entries()]
                .sort((a, b) => b[1].totalCentavos - a[1].totalCentavos)
                .map(([nome, dados]) => (
                  <tr key={nome}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{nome}</td>
                    <td className="px-4 py-3 text-neutral-700">{dados.quantidade}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatarM2(dados.areaM2)}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatarReais(dados.totalCentavos)}</td>
                  </tr>
                ))}
            </Tabela>
          )}
        </Card>
      </div>
    </>
  );
}
