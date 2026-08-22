"use client";

import { useEffect, useMemo, useState } from "react";
import type { Expansao, PrecoItem } from "@dilon-zap/esquadrias-core";
import { formatarM2, formatarReais } from "@dilon-zap/esquadrias-core";
import { AreaTexto, Botao, Campo, Entrada, EntradaMoeda, Selecao } from "@/components/campos";
import { enviar } from "@/lib/fetcher";

export type TipologiaOpcao = {
  id: string;
  nome: string;
  categoria: string;
  desenhoSvg: string | null;
  larguraMinMm: number;
  larguraMaxMm: number;
  alturaMinMm: number;
  alturaMaxMm: number;
  parametros: Array<{ chave: string; rotulo: string; valorPadrao: number }>;
};

export type CorOpcao = { id: string; nome: string; hex: string; fatorAluminio: number; fatorFerragem: number };

export type ItemExistente = {
  id: string;
  tipologiaId: string | null;
  descricao: string;
  larguraMm: number;
  alturaMm: number;
  quantidade: number;
  ambiente: string | null;
  observacoes: string | null;
  corAluminioId: string | null;
  corFerragemId: string | null;
  margemLucroPercent: number | null;
  acrescimoCentavos: number;
  descontoCentavos: number;
  adicionaisCentavos: number;
  parametros: Record<string, number> | null;
};

type Simulacao = { expansao: Expansao; preco: PrecoItem; aviso: string | null };

/**
 * Janela de adicionar/editar item.
 *
 * O cálculo aparece enquanto a pessoa digita, mas roda no SERVIDOR
 * (`/api/simular`): a fórmula da tipologia e o preço do kg são a tabela de
 * custo da empresa, e mandar isso pro navegador entregaria o segredo do
 * negócio a quem abrir o DevTools.
 */
export function ModalItem({
  orcamentoId,
  tipologias,
  cores,
  margemPadrao,
  item,
  mostrarCusto,
  aoFechar,
  aoSalvar,
}: {
  orcamentoId: string;
  tipologias: TipologiaOpcao[];
  cores: CorOpcao[];
  margemPadrao: number;
  item?: ItemExistente | null;
  mostrarCusto: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [tipologiaId, setTipologiaId] = useState(item?.tipologiaId ?? tipologias[0]?.id ?? "");
  const [larguraMm, setLargura] = useState(item?.larguraMm ?? 1200);
  const [alturaMm, setAltura] = useState(item?.alturaMm ?? 1000);
  const [quantidade, setQuantidade] = useState(item?.quantidade ?? 1);
  const [corAluminioId, setCorAluminio] = useState(item?.corAluminioId ?? cores[0]?.id ?? "");
  const [corFerragemId, setCorFerragem] = useState(item?.corFerragemId ?? "");
  const [margem, setMargem] = useState<number | "">(item?.margemLucroPercent ?? margemPadrao);
  const [acrescimoCentavos, setAcrescimo] = useState(item?.acrescimoCentavos ?? 0);
  const [descontoCentavos, setDesconto] = useState(item?.descontoCentavos ?? 0);
  const [adicionaisCentavos, setAdicionais] = useState(item?.adicionaisCentavos ?? 0);
  const [ambiente, setAmbiente] = useState(item?.ambiente ?? "");
  const [observacoes, setObservacoes] = useState(item?.observacoes ?? "");
  const [parametros, setParametros] = useState<Record<string, number>>(item?.parametros ?? {});

  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [erroCalculo, setErroCalculo] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [aba, setAba] = useState<"medidas" | "detalhes" | "materiais">("medidas");

  const tipologia = useMemo(() => tipologias.find((t) => t.id === tipologiaId), [tipologias, tipologiaId]);

  const corpoSimulacao = useMemo(
    () => ({
      tipologiaId,
      larguraMm,
      alturaMm,
      quantidade,
      corAluminioId: corAluminioId || null,
      corFerragemId: corFerragemId || null,
      margemLucroPercent: margem === "" ? null : margem,
      acrescimoCentavos,
      descontoCentavos,
      adicionaisCentavos,
      parametros: Object.keys(parametros).length > 0 ? parametros : null,
    }),
    [tipologiaId, larguraMm, alturaMm, quantidade, corAluminioId, corFerragemId, margem, acrescimoCentavos, descontoCentavos, adicionaisCentavos, parametros],
  );

  // Debounce de 350ms: sem ele, arrastar a largura de 1200 pra 1800 dispara
  // seis expansões de tipologia no servidor por segundo.
  useEffect(() => {
    if (!tipologiaId) return;

    let cancelado = false;
    setCalculando(true);
    const timer = setTimeout(async () => {
      try {
        const resultado = await enviar<Simulacao>("/api/simular", "POST", corpoSimulacao);
        if (cancelado) return;
        setSimulacao(resultado);
        setErroCalculo(null);
      } catch (e) {
        if (cancelado) return;
        setSimulacao(null);
        setErroCalculo(e instanceof Error ? e.message : "não foi possível calcular");
      } finally {
        if (!cancelado) setCalculando(false);
      }
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [corpoSimulacao, tipologiaId]);

  async function salvar() {
    setSalvando(true);
    setErroSalvar(null);
    try {
      const dados = { ...corpoSimulacao, ambiente: ambiente || null, observacoes: observacoes || null, descricao: tipologia?.nome };
      if (item) {
        await enviar(`/api/orcamentos/${orcamentoId}/itens/${item.id}`, "PATCH", dados);
      } else {
        await enviar(`/api/orcamentos/${orcamentoId}/itens`, "POST", dados);
      }
      aoSalvar();
    } catch (e) {
      setErroSalvar(e instanceof Error ? e.message : "não foi possível salvar");
      setSalvando(false);
    }
  }

  const preco = simulacao?.preco;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-950/60 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-surface">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold text-neutral-900">{item ? "Editar item" : "Adicionar item"}</h2>
          <button onClick={aoFechar} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100" aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="flex gap-1 border-b border-neutral-200 px-5 pt-3">
          {(
            [
              ["medidas", "Medidas e cores"],
              ["detalhes", "Preço e observações"],
              ["materiais", "Materiais gerados"],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`rounded-t-lg px-3 py-2 text-sm ${aba === chave ? "border-b-2 border-accent font-medium text-accent" : "text-neutral-500 hover:text-neutral-700"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {aba === "medidas" && (
            <div className="space-y-4">
              <Campo rotulo="Tipologia">
                <Selecao value={tipologiaId} onChange={(e) => setTipologiaId(e.target.value)}>
                  {tipologias.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>

              {tipologia?.desenhoSvg && (
                <div
                  className="mx-auto h-28 w-40 text-neutral-400 [&_svg]:h-full [&_svg]:w-full"
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: tipologia.desenhoSvg }}
                />
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <Campo rotulo="Largura (mm)" ajuda={tipologia ? `${tipologia.larguraMinMm}–${tipologia.larguraMaxMm}` : undefined}>
                  <Entrada type="number" min={50} value={larguraMm} onChange={(e) => setLargura(Number(e.target.value) || 0)} />
                </Campo>
                <Campo rotulo="Altura (mm)" ajuda={tipologia ? `${tipologia.alturaMinMm}–${tipologia.alturaMaxMm}` : undefined}>
                  <Entrada type="number" min={50} value={alturaMm} onChange={(e) => setAltura(Number(e.target.value) || 0)} />
                </Campo>
                <Campo rotulo="Quantidade">
                  <Entrada type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))} />
                </Campo>
              </div>

              <Campo rotulo="Cor do alumínio">
                <div className="flex flex-wrap gap-2">
                  {cores.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCorAluminio(c.id)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                        corAluminioId === c.id ? "border-accent bg-accent/10 text-accent" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="h-3.5 w-3.5 rounded-full border border-neutral-300" style={{ background: c.hex }} />
                      {c.nome}
                      {/* O acréscimo da cor aparece na hora da escolha, não só
                          no total: é onde a margem some sem ninguém perceber. */}
                      {c.fatorAluminio !== 1 && <span className="text-xs opacity-70">+{Math.round((c.fatorAluminio - 1) * 100)}%</span>}
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo rotulo="Cor das ferragens">
                <Selecao value={corFerragemId} onChange={(e) => setCorFerragem(e.target.value)}>
                  <option value="">Padrão</option>
                  {cores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>

              {tipologia && tipologia.parametros.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-700">Ajustes desta esquadria</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tipologia.parametros.map((p) => (
                      <Campo key={p.chave} rotulo={p.rotulo} ajuda={`padrão ${p.valorPadrao}`}>
                        <Entrada
                          type="number"
                          value={parametros[p.chave] ?? p.valorPadrao}
                          onChange={(e) => setParametros((atual) => ({ ...atual, [p.chave]: Number(e.target.value) || 0 }))}
                        />
                      </Campo>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {aba === "detalhes" && (
            <div className="space-y-4">
              {mostrarCusto && (
                <Campo rotulo="Margem de lucro (%)" ajuda={`Padrão da empresa: ${margemPadrao}%. Vale só para este item.`}>
                  <Entrada
                    type="number"
                    min={0}
                    value={margem}
                    onChange={(e) => setMargem(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Campo>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <Campo rotulo="Acréscimo">
                  <EntradaMoeda valorCentavos={acrescimoCentavos} onChange={setAcrescimo} />
                </Campo>
                <Campo rotulo="Desconto">
                  <EntradaMoeda valorCentavos={descontoCentavos} onChange={setDesconto} />
                </Campo>
                <Campo rotulo="Adicionais de custo" ajuda="Contramarco, instalação especial, frete do item.">
                  <EntradaMoeda valorCentavos={adicionaisCentavos} onChange={setAdicionais} />
                </Campo>
              </div>

              <Campo rotulo="Ambiente de instalação">
                <Entrada value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Sala, quarto 1, área de serviço…" />
              </Campo>

              <Campo rotulo="Observações">
                <AreaTexto rows={4} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </Campo>
            </div>
          )}

          {aba === "materiais" && (
            <div className="space-y-5 text-sm">
              {!simulacao ? (
                <p className="text-neutral-500">{erroCalculo ?? "Calculando…"}</p>
              ) : (
                <>
                  <section>
                    <h3 className="mb-2 font-medium text-neutral-900">Cortes de alumínio</h3>
                    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                      {simulacao.expansao.pecas.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-neutral-900">{p.descricao}</span>
                            <span className="block text-xs text-neutral-500">
                              {p.perfilCodigo} · {p.corte === "RETO" ? "corte reto" : "corte 45°"}
                            </span>
                          </span>
                          <span className="shrink-0 text-neutral-700">
                            {p.quantidade} × {p.comprimentoMm} mm
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="mb-2 font-medium text-neutral-900">Vidros</h3>
                    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                      {simulacao.expansao.vidros.map((v, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 truncate text-neutral-900">{v.vidroNome}</span>
                          <span className="shrink-0 text-neutral-700">
                            {v.quantidade} × {v.larguraMm}×{v.alturaMm} mm ({formatarM2(v.m2CobradoUnitario * v.quantidade)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="mb-2 font-medium text-neutral-900">Ferragens</h3>
                    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                      {simulacao.expansao.ferragens.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 truncate text-neutral-900">{f.ferragemNome}</span>
                          <span className="shrink-0 text-neutral-700">
                            {f.quantidade} {f.unidade}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <p className="text-xs text-neutral-500">
                    Peso total de alumínio: {simulacao.expansao.pesoTotalKg.toFixed(2)} kg · Área: {formatarM2(simulacao.expansao.areaTotalM2)}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-neutral-200 bg-neutral-50 px-5 py-4">
          {simulacao?.aviso && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{simulacao.aviso}</p>}
          {erroCalculo && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{erroCalculo}</p>}
          {erroSalvar && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{erroSalvar}</p>}

          <dl className={`mb-3 grid gap-x-6 gap-y-1 text-sm ${mostrarCusto ? "sm:grid-cols-2" : ""}`}>
            {mostrarCusto && preco && (
              <>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Custo</dt>
                  <dd className="text-neutral-700">{formatarReais(preco.custoTotalCentavos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Lucro ({preco.margemLucroPercent}%)</dt>
                  <dd className="text-emerald-600">{formatarReais(preco.lucroCentavos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd className="text-neutral-700">{formatarReais(preco.subtotalCentavos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Acréscimo / desconto</dt>
                  <dd className="text-neutral-700">{formatarReais(preco.acrescimoCentavos - preco.descontoCentavos)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between sm:col-span-2 border-t border-neutral-200 pt-1">
              <dt className="font-semibold text-neutral-900">TOTAL</dt>
              <dd className="font-semibold text-neutral-900">
                {calculando && !preco ? "…" : preco ? formatarReais(preco.totalCentavos) : "—"}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao onClick={salvar} disabled={salvando || !simulacao}>
              {salvando ? "Salvando…" : item ? "Salvar item" : "Adicionar"}
            </Botao>
          </div>
        </footer>
      </div>
    </div>
  );
}
