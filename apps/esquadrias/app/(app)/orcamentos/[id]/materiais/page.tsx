import Link from "next/link";
import { notFound } from "next/navigation";
import { agregarMateriais, formatarReais, planejarCorte, entradasDeCorte } from "@dilon-zap/esquadrias-core";
import { Card, Tabela } from "@/components/ui";
import { expansoesDoOrcamento } from "@/lib/calculo";
import { requireUsuario } from "@/lib/session";
import { vePreco } from "@/lib/papeis";
import { temRecurso } from "@/lib/planos";
import { BotaoImprimir } from "@/components/botao-imprimir";

export const dynamic = "force-dynamic";

// A chave é ALUMINIO por história; o rótulo diz "Perfis e barras" porque a
// mesma lista serve a linha de alumínio e a de ferro da serralheria.
const ROTULO = { ALUMINIO: "Perfis e barras", VIDRO: "Vidros", FERRAGEM: "Ferragens e insumos" } as const;

export default async function MateriaisPage({ params }: { params: { id: string } }) {
  const usuario = await requireUsuario();
  const dados = await expansoesDoOrcamento(params.id, usuario.empresaId);
  if (!dados) notFound();

  const { orcamento, itens } = dados;
  const expansoes = itens.map((i) => i.memoria?.expansao).filter((e): e is NonNullable<typeof e> => Boolean(e));

  // A quantidade de BARRAS vem do plano de corte quando a empresa tem o
  // recurso; sem ele, é estimada por metro linear e arredondada pra cima.
  // Comprar barra a menos para a obra — a estimativa erra sempre pro lado
  // seguro, e a etiqueta na tabela diz qual dos dois números está ali.
  const barrasPorPerfil: Record<string, number> = {};
  if (temRecurso(usuario.plano, "PLANO_CORTE") && expansoes.length > 0) {
    const plano = planejarCorte(
      entradasDeCorte(expansoes.flatMap((e) => e.pecas)),
      { espessuraSerraMm: orcamento.empresa.espessuraSerraMm, sobraMinimaAproveitavelMm: orcamento.empresa.sobraMinimaAproveitavelMm },
    );
    for (const perfil of plano.perfis) barrasPorPerfil[perfil.perfilId] = perfil.totalBarras;
  }

  const linhas = agregarMateriais(expansoes.map((expansao) => ({ expansao })), barrasPorPerfil);
  const mostrarCusto = vePreco(usuario.papel);
  const grupos = (["ALUMINIO", "VIDRO", "FERRAGEM"] as const).map((tipo) => ({ tipo, itens: linhas.filter((l) => l.tipo === tipo) }));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/orcamentos/${params.id}`} className="text-sm text-accent hover:underline nao-imprimir">
            ← voltar ao orçamento
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Relação de materiais</h1>
          <p className="text-sm text-neutral-500">
            Orçamento #{orcamento.numero} · {orcamento.cliente?.nome ?? "sem cliente"} · {orcamento.empresa.nome}
          </p>
        </div>
        <BotaoImprimir />
      </div>

      {linhas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-neutral-500">
          Nenhum material calculado ainda — adicione itens ao orçamento.
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map(
            ({ tipo, itens: doGrupo }) =>
              doGrupo.length > 0 && (
                <Card key={tipo}>
                  <h2 className="border-b border-neutral-200 px-4 py-3 font-medium text-neutral-900">{ROTULO[tipo]}</h2>
                  <Tabela cabecalho={["Insumo", "Detalhe", "Quantidade", ...(mostrarCusto ? ["Custo"] : [])]}>
                    {doGrupo.map((l) => (
                      <tr key={`${l.tipo}-${l.insumoId}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-neutral-900">{l.nome}</span>
                          {l.codigo && <span className="ml-2 text-xs text-neutral-500">{l.codigo}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-500">{l.detalhe}</td>
                        <td className="px-4 py-3 text-neutral-700">
                          {l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {l.unidade}
                        </td>
                        {mostrarCusto && <td className="px-4 py-3 text-neutral-700">{formatarReais(l.custoCentavos)}</td>}
                      </tr>
                    ))}
                  </Tabela>
                </Card>
              ),
          )}

          {mostrarCusto && (
            <Card className="p-4 text-right">
              <span className="text-sm text-neutral-500">Custo total de materiais </span>
              <span className="text-lg font-semibold text-neutral-900">
                {formatarReais(linhas.reduce((a, l) => a + l.custoCentavos, 0))}
              </span>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
