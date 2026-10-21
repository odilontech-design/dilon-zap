"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { dataHoraBR, fetcher, hojeISO } from "../receber/formatos";

type Tipo = "COMPRA" | "PRODUCAO" | "DEVOLUCAO" | "AJUSTE" | "VENDA";
const ROTULO_TIPO: Record<Tipo, string> = { COMPRA: "Compra", PRODUCAO: "Produção", DEVOLUCAO: "Devolução", AJUSTE: "Ajuste", VENDA: "Venda" };

type LinhaResumo = {
  productId: string;
  codigo: string | null;
  produto: string;
  categoria: string | null;
  ativo: boolean;
  precoCents: number;
  saldoInicial: number;
  compras: number;
  producao: number;
  devolucoes: number;
  ajustes: number;
  vendas: number;
  saldoFinal: number;
  valorFinalCents: number;
  custoCents: number | null;
  valorCustoCents: number;
  cmvCents: number;
  vendasSemCusto: number;
};

type LinhaMovimento = {
  id: string;
  data: string;
  codigo: string | null;
  produto: string;
  tipo: Tipo;
  quantidade: number;
  saldoDepois: number;
  custoUnitCents: number | null;
  motivo: string | null;
  por: string | null;
};

function margem(precoCents: number, custoCents: number | null): string {
  if (custoCents === null || precoCents <= 0) return "—";
  return `${(((precoCents - custoCents) / precoCents) * 100).toFixed(1).replace(".", ",")}%`;
}

const primeiroDoMes = () => `${hojeISO().slice(0, 8)}01`;

function sinal(n: number) {
  if (n === 0) return <span className="text-neutral-300">0</span>;
  return <span className={n < 0 ? "text-red-600" : "text-green-700"}>{n > 0 ? `+${n}` : n}</span>;
}

function Cartao({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 min-w-[150px]">
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-400">{nota}</p>}
    </div>
  );
}

export function EstoquePanel({ empresa }: { empresa: string }) {
  const [visao, setVisao] = useState<"resumo" | "movimentos">("resumo");
  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(hojeISO);
  const [produto, setProduto] = useState("");
  const [tipo, setTipo] = useState<"" | Tipo>("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"todos" | "com_saldo" | "zerados" | "negativos" | "movimentados">("todos");

  const base = `de=${de}&ate=${ate}${produto ? `&produto=${produto}` : ""}`;
  const urlResumo = `/api/estoque?visao=resumo&${base}`;
  const urlMovs = `/api/estoque?visao=movimentos&${base}${tipo ? `&tipo=${tipo}` : ""}`;

  // O resumo carrega sempre: é dele que sai a lista do filtro de produto.
  const resumo = useSWR<{ linhas: LinhaResumo[] }>(de && ate ? urlResumo : null, fetcher);
  const movs = useSWR<{ linhas: LinhaMovimento[]; cortado: boolean }>(visao === "movimentos" && de && ate ? urlMovs : null, fetcher);

  const opcoesProduto = useMemo(
    () => [...(resumo.data?.linhas ?? [])].sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR")),
    [resumo.data]
  );

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const casa = (texto: (string | null)[]) => !termo || texto.some((t) => t?.toLocaleLowerCase("pt-BR").includes(termo));

  const linhasResumo = (resumo.data?.linhas ?? []).filter((l) => {
    if (!casa([l.produto, l.codigo, l.categoria])) return false;
    if (situacao === "com_saldo") return l.saldoFinal > 0;
    if (situacao === "zerados") return l.saldoFinal === 0;
    if (situacao === "negativos") return l.saldoFinal < 0;
    if (situacao === "movimentados") return l.compras || l.producao || l.devolucoes || l.ajustes || l.vendas;
    return true;
  });
  const linhasMovs = (movs.data?.linhas ?? []).filter((l) => casa([l.produto, l.codigo, l.motivo]));

  const totais = linhasResumo.reduce(
    (t, l) => ({
      entradas: t.entradas + l.compras + l.producao + l.devolucoes + Math.max(l.ajustes, 0),
      saidas: t.saidas + l.vendas + Math.max(-l.ajustes, 0),
      unidades: t.unidades + Math.max(l.saldoFinal, 0),
      valor: t.valor + l.valorFinalCents,
      valorCusto: t.valorCusto + l.valorCustoCents,
      cmv: t.cmv + l.cmvCents,
      vendasSemCusto: t.vendasSemCusto + l.vendasSemCusto,
      semCusto: t.semCusto + (l.custoCents === null ? 1 : 0),
      negativos: t.negativos + (l.saldoFinal < 0 ? 1 : 0),
    }),
    { entradas: 0, saidas: 0, unidades: 0, valor: 0, valorCusto: 0, cmv: 0, vendasSemCusto: 0, semCusto: 0, negativos: 0 }
  );

  const carregando = visao === "resumo" ? resumo.isLoading : movs.isLoading;
  const erro = visao === "resumo" ? resumo.error : movs.error;
  const urlCsv = `${visao === "resumo" ? urlResumo : urlMovs}&formato=csv`;
  const periodoTexto = `${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`;

  const campo = "rounded-md border border-neutral-200 bg-surface px-2 py-1.5 text-sm";
  const aba = (ativa: boolean) =>
    `rounded-md px-3 py-1 text-sm ${ativa ? "bg-accent/10 font-medium text-accent" : "text-neutral-500 hover:text-neutral-800"}`;
  const th = "px-3 py-2 font-medium";

  return (
    <div id="relatorio-estoque">
      {/* Na impressão sai só o relatório: menu, filtros e botões ficam de fora. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-estoque, #relatorio-estoque * { visibility: visible; }
          #relatorio-estoque { position: absolute; inset: 0; padding: 0 8px; }
          #relatorio-estoque .so-tela { display: none !important; }
          #relatorio-estoque table { font-size: 10px; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="so-tela flex flex-wrap items-end gap-3 mb-4">
        <div className="flex gap-1 mr-2">
          <button className={aba(visao === "resumo")} onClick={() => setVisao("resumo")}>Resumo por produto</button>
          <button className={aba(visao === "movimentos")} onClick={() => setVisao("movimentos")}>Movimentações</button>
        </div>
        <label className="text-xs text-neutral-500">
          De
          <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-xs text-neutral-500">
          Até
          <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-xs text-neutral-500">
          Produto
          <select value={produto} onChange={(e) => setProduto(e.target.value)} className={`${campo} block mt-0.5 max-w-[240px]`}>
            <option value="">Todos os produtos</option>
            {opcoesProduto.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.codigo ? `${p.codigo} · ` : ""}
                {p.produto}
              </option>
            ))}
          </select>
        </label>
        {visao === "movimentos" ? (
          <label className="text-xs text-neutral-500">
            Tipo de operação
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "" | Tipo)} className={`${campo} block mt-0.5`}>
              <option value="">Todos</option>
              {(Object.keys(ROTULO_TIPO) as Tipo[]).map((t) => (
                <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-xs text-neutral-500">
            Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} className={`${campo} block mt-0.5`}>
              <option value="todos">Todos</option>
              <option value="com_saldo">Com saldo</option>
              <option value="zerados">Zerados</option>
              <option value="negativos">Saldo negativo</option>
              <option value="movimentados">Movimentados no período</option>
            </select>
          </label>
        )}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código ou categoria"
          className={`${campo} flex-1 min-w-[200px]`}
        />
        <a href={urlCsv} className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Exportar Excel
        </a>
        <button onClick={() => window.print()} className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Imprimir
        </button>
      </div>

      <p className="text-sm text-neutral-500 mb-3">
        <span className="font-medium text-neutral-800">
          {empresa} · {visao === "resumo" ? "Resumo do estoque" : "Movimentações de estoque"}
        </span>{" "}
        · {periodoTexto}
        {produto && opcoesProduto.find((p) => p.productId === produto) && ` · ${opcoesProduto.find((p) => p.productId === produto)!.produto}`}
      </p>

      {erro && <p className="text-sm text-red-600 mb-3">{String((erro as Error).message)}</p>}
      {carregando && <p className="text-sm text-neutral-400">Carregando…</p>}

      {visao === "resumo" && resumo.data && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <Cartao titulo="Produtos" valor={String(linhasResumo.length)} nota={totais.negativos ? `${totais.negativos} com saldo negativo` : undefined} />
            <Cartao titulo="Entradas no período" valor={`${totais.entradas} un.`} />
            <Cartao titulo="Saídas no período" valor={`${totais.saidas} un.`} />
            <Cartao titulo="Unidades em estoque" valor={`${totais.unidades} un.`} nota={`em ${ate.split("-").reverse().join("/")}`} />
            <Cartao titulo="Valor do estoque" valor={centsToBRL(totais.valor)} nota="a preço de venda" />
            <Cartao
              titulo="Valor do estoque a custo"
              valor={centsToBRL(totais.valorCusto)}
              nota={totais.semCusto ? `${totais.semCusto} produto(s) sem valor de compra` : "pelo valor de compra"}
            />
            <Cartao
              titulo="CMV no período"
              valor={centsToBRL(totais.cmv)}
              nota={totais.vendasSemCusto ? `${totais.vendasSemCusto} un. vendidas sem custo ficaram fora` : "custo das vendas, menos devoluções"}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className={th}>Código</th>
                  <th className={th}>Produto</th>
                  <th className={`${th} text-right`}>Saldo inicial</th>
                  <th className={`${th} text-right`}>Compras</th>
                  <th className={`${th} text-right`}>Produção</th>
                  <th className={`${th} text-right`}>Devoluções</th>
                  <th className={`${th} text-right`}>Ajustes</th>
                  <th className={`${th} text-right`}>Vendas</th>
                  <th className={`${th} text-right`}>Saldo final</th>
                  <th className={`${th} text-right`}>Preço</th>
                  <th className={`${th} text-right`}>Custo</th>
                  <th className={`${th} text-right`}>Margem</th>
                  <th className={`${th} text-right`}>Valor do saldo</th>
                  <th className={`${th} text-right`}>Saldo a custo</th>
                  <th className={`${th} text-right`}>CMV</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {linhasResumo.map((l) => (
                  <tr key={l.productId} className="border-t border-neutral-100">
                    <td className="px-3 py-2 text-neutral-500">{l.codigo ?? "—"}</td>
                    <td className="px-3 py-2">
                      {l.produto}
                      {!l.ativo && <span className="ml-2 text-[10px] text-neutral-400">desativado</span>}
                      {l.categoria && <span className="block text-[11px] text-neutral-400">{l.categoria}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{l.saldoInicial}</td>
                    <td className="px-3 py-2 text-right">{l.compras ? `+${l.compras}` : <span className="text-neutral-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{l.producao ? `+${l.producao}` : <span className="text-neutral-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{l.devolucoes ? `+${l.devolucoes}` : <span className="text-neutral-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{sinal(l.ajustes)}</td>
                    <td className="px-3 py-2 text-right">{l.vendas ? `-${l.vendas}` : <span className="text-neutral-300">0</span>}</td>
                    <td className={`px-3 py-2 text-right font-medium ${l.saldoFinal < 0 ? "text-red-600" : ""}`}>{l.saldoFinal}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{centsToBRL(l.precoCents)}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{l.custoCents === null ? "—" : centsToBRL(l.custoCents)}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{margem(l.precoCents, l.custoCents)}</td>
                    <td className="px-3 py-2 text-right">{centsToBRL(l.valorFinalCents)}</td>
                    <td className="px-3 py-2 text-right">{l.custoCents === null ? "—" : centsToBRL(l.valorCustoCents)}</td>
                    <td className="px-3 py-2 text-right" title={l.vendasSemCusto ? `${l.vendasSemCusto} un. vendidas sem custo conhecido` : undefined}>
                      {l.cmvCents ? centsToBRL(l.cmvCents) : <span className="text-neutral-300">—</span>}
                      {l.vendasSemCusto > 0 && <span className="text-amber-700"> *</span>}
                    </td>
                  </tr>
                ))}
                {linhasResumo.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-neutral-400">Nenhum produto com esse filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {visao === "movimentos" && movs.data && (
        <>
          {movs.data.cortado && (
            <p className="text-xs text-amber-700 mb-2">Mostrando as 5.000 movimentações mais recentes. Diminua o período para ver o restante.</p>
          )}
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className={th}>Data</th>
                  <th className={th}>Código</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Tipo de operação</th>
                  <th className={`${th} text-right`}>Quantidade</th>
                  <th className={`${th} text-right`}>Saldo depois</th>
                  <th className={`${th} text-right`}>Custo unit.</th>
                  <th className={th}>Motivo</th>
                  <th className={th}>Lançado por</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {linhasMovs.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{dataHoraBR(m.data)}</td>
                    <td className="px-3 py-2 text-neutral-500">{m.codigo ?? "—"}</td>
                    <td className="px-3 py-2">{m.produto}</td>
                    <td className="px-3 py-2">{ROTULO_TIPO[m.tipo]}</td>
                    <td className="px-3 py-2 text-right">{sinal(m.quantidade)}</td>
                    <td className="px-3 py-2 text-right">{m.saldoDepois}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{m.custoUnitCents === null ? "—" : centsToBRL(m.custoUnitCents)}</td>
                    <td className="px-3 py-2 text-neutral-500">{m.motivo ?? ""}</td>
                    <td className="px-3 py-2 text-neutral-500">{m.por ?? "Sistema"}</td>
                  </tr>
                ))}
                {linhasMovs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-neutral-400">Nenhuma movimentação nesse período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
