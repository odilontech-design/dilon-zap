import Link from "next/link";
import { notFound } from "next/navigation";
import { entradasDeCorte, formatarReais, planejarCorte } from "@dilon-zap/esquadrias-core";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Card, Indicador } from "@/components/ui";
import { expansoesDoOrcamento } from "@/lib/calculo";
import { requireRecurso } from "@/lib/session";
import { vePreco } from "@/lib/papeis";

export const dynamic = "force-dynamic";

export default async function CortePage({ params }: { params: { id: string } }) {
  const usuario = await requireRecurso("PLANO_CORTE");
  const dados = await expansoesDoOrcamento(params.id, usuario.empresaId);
  if (!dados) notFound();

  const { orcamento, itens } = dados;
  const empresa = orcamento.empresa;

  // A origem da peça ("Janela sala — Trilho superior") vai junto de cada corte
  // porque quem está na serra precisa saber pra onde vai a peça: sem isso, um
  // erro de 2mm só aparece na montagem, com o alumínio já cortado.
  const pecas = itens.flatMap(({ item, memoria }) =>
    (memoria?.expansao.pecas ?? []).map((p) => ({ ...p, descricao: `${item.ambiente ? `${item.ambiente} — ` : ""}${p.descricao}` })),
  );

  const plano = planejarCorte(entradasDeCorte(pecas), {
    espessuraSerraMm: empresa.espessuraSerraMm,
    sobraMinimaAproveitavelMm: empresa.sobraMinimaAproveitavelMm,
  });

  const mostrarCusto = vePreco(usuario.papel);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/orcamentos/${params.id}`} className="text-sm text-accent hover:underline nao-imprimir">
            ← voltar ao orçamento
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Plano de corte</h1>
          <p className="text-sm text-neutral-500">
            Orçamento #{orcamento.numero} · serra de {empresa.espessuraSerraMm} mm · retalho útil a partir de {empresa.sobraMinimaAproveitavelMm} mm
          </p>
        </div>
        <BotaoImprimir rotulo="Imprimir para a bancada" />
      </div>

      {plano.perfis.length === 0 ? (
        <Card className="p-8 text-center text-sm text-neutral-500">Nenhuma peça de perfil para cortar neste orçamento.</Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador rotulo="Barras necessárias" valor={String(plano.totalBarras)} />
            <Indicador
              rotulo="Aproveitamento"
              valor={`${plano.aproveitamentoPercent}%`}
              tom={plano.aproveitamentoPercent >= 85 ? "verde" : plano.aproveitamentoPercent >= 70 ? "neutro" : "vermelho"}
            />
            <Indicador rotulo="Perfis diferentes" valor={String(plano.perfis.length)} />
            {mostrarCusto && <Indicador rotulo="Custo das barras" valor={formatarReais(plano.custoBarrasCentavos)} />}
          </div>

          <div className="space-y-6">
            {plano.perfis.map((perfil) => (
              <Card key={`${perfil.perfilId}-${perfil.comprimentoBarraMm}`} className="p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium text-neutral-900">
                    {perfil.perfilCodigo} · {perfil.perfilNome}
                  </h2>
                  <p className="text-sm text-neutral-500">
                    {perfil.totalBarras} barra(s) de {perfil.comprimentoBarraMm} mm · {perfil.totalPecas} peças ·{" "}
                    {perfil.aproveitamentoPercent}% de aproveitamento · retalho útil {(perfil.sobraAproveitavelMm / 1000).toFixed(2)} m
                  </p>
                </div>

                <ol className="space-y-3">
                  {perfil.barras.map((barra) => (
                    <li key={barra.numero}>
                      <div className="mb-1 flex items-baseline justify-between text-xs text-neutral-500">
                        <span>Barra {barra.numero}</span>
                        <span>
                          sobra {barra.sobraMm} mm
                          {barra.sobraAproveitavel ? " (guardar como retalho)" : " (refugo)"}
                        </span>
                      </div>

                      {/* Cada peça ocupa a largura proporcional ao corte: quem
                          está na bancada confere o plano de relance, sem ler
                          número por número. */}
                      <div className="flex h-9 w-full overflow-hidden rounded-md border border-neutral-300 bg-neutral-100">
                        {barra.pecas.map((peca, i) => (
                          <div
                            key={i}
                            title={`${peca.descricao} — ${peca.comprimentoMm} mm`}
                            style={{ width: `${(peca.comprimentoMm / barra.comprimentoBarraMm) * 100}%` }}
                            className="flex items-center justify-center overflow-hidden border-r border-white/60 bg-accent/25 text-[10px] text-neutral-800"
                          >
                            {peca.comprimentoMm}
                          </div>
                        ))}
                      </div>

                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                        {barra.pecas.map((peca, i) => (
                          <li key={i}>
                            {peca.comprimentoMm} mm — {peca.descricao}
                            {peca.corte !== "RETO" && " (45°)"}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
