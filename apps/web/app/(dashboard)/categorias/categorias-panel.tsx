"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { porGrupo, useCategorias, type CategoriaFinanceira } from "@/components/campo-categoria";
import { chamar, fetcher, hojeISO } from "../receber/formatos";

type Linha = { categoriaId: string | null; nome: string; ativa: boolean; realizadoCents: number; abertoCents: number };
type Grupo = { tipo: "RECEITA" | "DESPESA"; grupo: string; realizadoCents: number; abertoCents: number; categorias: Linha[] };
type Par = { realizadoCents: number; abertoCents: number };
type Relatorio = { grupos: Grupo[]; totais: { receitas: Par; despesas: Par; resultado: Par } };

/** Primeiro e último dia de um mês, deslocado de hoje. */
function mes(desloc: number): [string, string] {
  const [a, m] = hojeISO().split("-").map(Number);
  const ini = new Date(Date.UTC(a, m - 1 + desloc, 1));
  const fim = new Date(Date.UTC(a, m + desloc, 0));
  return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
}

const ATALHOS: { rotulo: string; periodo: () => [string, string] }[] = [
  { rotulo: "Este mês", periodo: () => mes(0) },
  { rotulo: "Mês passado", periodo: () => mes(-1) },
  { rotulo: "Este ano", periodo: () => [`${hojeISO().slice(0, 4)}-01-01`, `${hojeISO().slice(0, 4)}-12-31`] },
];

const sinal = (v: number) => (v < 0 ? "text-red-600" : "");

export function CategoriasPanel() {
  const [[de, ate], setPeriodo] = useState<[string, string]>(mes(0));
  const [editando, setEditando] = useState(false);
  const { data, error } = useSWR<Relatorio>(de && ate ? `/api/financeiro/por-categoria?de=${de}&ate=${ate}` : null, fetcher, {
    keepPreviousData: true,
  });
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";

  function baixarCsv() {
    if (!data) return;
    const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    const linhas = [["Tipo", "Grupo", "Categoria", "Realizado", "Em aberto"]];
    for (const g of data.grupos) {
      for (const c of g.categorias) linhas.push([g.tipo === "RECEITA" ? "Receita" : "Despesa", g.grupo, c.nome, reais(c.realizadoCents), reais(c.abertoCents)]);
    }
    linhas.push(["", "", "Resultado", reais(data.totais.resultado.realizadoCents), reais(data.totais.resultado.abertoCents)]);
    const csv = "﻿" + linhas.map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `financeiro-por-categoria-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <p className="text-sm text-neutral-500">
        Quanto entrou e saiu em cada categoria do plano de contas. <strong className="font-medium text-neutral-700">Realizado</strong> é o
        dinheiro que de fato entrou ou saiu no período; <strong className="font-medium text-neutral-700">em aberto</strong> é o que ainda falta
        receber ou pagar das parcelas que vencem nele.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-neutral-500">
          De
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setPeriodo([e.target.value, ate])} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-[11px] text-neutral-500">
          Até
          <input type="date" value={ate} min={de || undefined} onChange={(e) => setPeriodo([de, e.target.value])} className={`${campo} block mt-0.5`} />
        </label>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {ATALHOS.map((a) => (
            <button key={a.rotulo} onClick={() => setPeriodo(a.periodo())} className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs hover:border-accent">
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2 pb-0.5">
          <button onClick={baixarCsv} disabled={!data} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50">
            Baixar planilha
          </button>
          <button onClick={() => setEditando(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-accent">
            Editar categorias
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Carregando...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cartao titulo="Receitas" par={data.totais.receitas} />
            <Cartao titulo="Despesas" par={data.totais.despesas} />
            <Cartao titulo="Resultado" par={data.totais.resultado} destaque />
          </div>

          {(["RECEITA", "DESPESA"] as const).map((tipo) => {
            const grupos = data.grupos.filter((g) => g.tipo === tipo);
            const total = tipo === "RECEITA" ? data.totais.receitas : data.totais.despesas;
            return (
              <div key={tipo} className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">{tipo === "RECEITA" ? "Receitas" : "Despesas"}</th>
                      <th className="text-right font-medium px-4 py-2 w-36">Realizado</th>
                      <th className="text-right font-medium px-4 py-2 w-36">Em aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-neutral-400">
                          Nenhuma categoria.
                        </td>
                      </tr>
                    )}
                    {grupos.map((g) => (
                      <GrupoLinhas key={g.grupo} g={g} />
                    ))}
                    <tr className="border-t-2 border-neutral-200 font-semibold">
                      <td className="px-4 py-2.5">Total de {tipo === "RECEITA" ? "receitas" : "despesas"}</td>
                      <td className="px-4 py-2.5 text-right">{centsToBRL(total.realizadoCents)}</td>
                      <td className="px-4 py-2.5 text-right">{centsToBRL(total.abertoCents)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}

          {data.grupos.some((g) => g.categorias.some((c) => c.categoriaId === null)) && (
            <p className="text-xs text-neutral-500">
              &quot;Sem categoria&quot; são contas lançadas antes do plano de contas ou sem categoria escolhida. Para classificar, abra a conta em A
              receber ou A pagar e escolha a categoria — dá para filtrar por &quot;Sem categoria&quot; lá.
            </p>
          )}
        </>
      )}

      {editando && <EditarPlano onFechar={() => setEditando(false)} />}
    </div>
  );
}

function Cartao({ titulo, par, destaque }: { titulo: string; par: Par; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${destaque ? "border-accent/40 bg-accent/5" : "border-neutral-200 bg-surface"}`}>
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${sinal(par.realizadoCents)}`}>{centsToBRL(par.realizadoCents)}</p>
      <p className="text-[11px] text-neutral-500 tabular-nums">
        em aberto: <span className={sinal(par.abertoCents)}>{centsToBRL(par.abertoCents)}</span>
      </p>
    </div>
  );
}

function GrupoLinhas({ g }: { g: Grupo }) {
  return (
    <>
      <tr className="border-t border-neutral-100 bg-neutral-50/60 font-medium">
        <td className="px-4 py-2">{g.grupo}</td>
        <td className="px-4 py-2 text-right">{centsToBRL(g.realizadoCents)}</td>
        <td className="px-4 py-2 text-right">{centsToBRL(g.abertoCents)}</td>
      </tr>
      {g.categorias.map((c) => (
        <tr key={c.categoriaId ?? "sem"} className="border-t border-neutral-100">
          <td className="px-4 py-2 pl-8 text-neutral-700">
            {c.nome}
            {!c.ativa && <span className="text-xs text-neutral-400"> (desativada)</span>}
          </td>
          <td className={`px-4 py-2 text-right ${c.realizadoCents ? sinal(c.realizadoCents) : "text-neutral-300"}`}>{centsToBRL(c.realizadoCents)}</td>
          <td className={`px-4 py-2 text-right ${c.abertoCents ? "" : "text-neutral-300"}`}>{centsToBRL(c.abertoCents)}</td>
        </tr>
      ))}
    </>
  );
}

/** O plano de contas: acrescentar, renomear, desativar. */
function EditarPlano({ onFechar }: { onFechar: () => void }) {
  const { categorias, mutate } = useCategorias();
  const [nova, setNova] = useState<{ tipo: "RECEITA" | "DESPESA"; grupo: string; nome: string }>({ tipo: "DESPESA", grupo: "", nome: "" });
  const [erro, setErro] = useState<string | null>(null);
  const campo = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm bg-surface";
  const gruposExistentes = [...new Set((categorias ?? []).filter((c) => c.tipo === nova.tipo).map((c) => c.grupo))];

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.grupo.trim() || !nova.nome.trim()) return setErro("informe o grupo e o nome");
    setErro(null);
    const r = await chamar("/api/categorias-financeiras", "POST", nova);
    if (!r.ok) return setErro(r.erro ?? "não deu pra criar");
    setNova({ ...nova, nome: "" });
    mutate();
  }

  async function renomear(c: CategoriaFinanceira) {
    const nome = prompt("Novo nome da categoria:", c.nome)?.trim();
    if (!nome || nome === c.nome) return;
    const r = await chamar(`/api/categorias-financeiras/${c.id}`, "PATCH", { nome });
    if (!r.ok) return setErro(r.erro ?? "não deu pra renomear");
    mutate();
  }

  async function remover(c: CategoriaFinanceira) {
    if (!confirm(`Remover "${c.nome}"? Se ela já foi usada, fica desativada e as contas antigas continuam nela.`)) return;
    const r = await chamar(`/api/categorias-financeiras/${c.id}`, "DELETE");
    if (!r.ok) return setErro(r.erro ?? "não deu pra remover");
    mutate();
  }

  async function reativar(c: CategoriaFinanceira) {
    const r = await chamar(`/api/categorias-financeiras/${c.id}`, "PATCH", { ativa: true });
    if (!r.ok) return setErro(r.erro ?? "não deu pra reativar");
    mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <aside className="bg-surface w-full max-w-lg h-full overflow-y-auto shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Plano de contas</h2>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={criar} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
          <p className="text-xs font-medium text-neutral-700">Nova categoria</p>
          <div className="flex flex-wrap gap-2">
            <select value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as typeof nova.tipo, grupo: "" })} className={campo}>
              <option value="DESPESA">Despesa</option>
              <option value="RECEITA">Receita</option>
            </select>
            <input list="grupos-financeiros" value={nova.grupo} onChange={(e) => setNova({ ...nova, grupo: e.target.value })} placeholder="Grupo (ex: Despesas fixas)" className={`${campo} flex-1 min-w-[150px]`} />
            <datalist id="grupos-financeiros">
              {gruposExistentes.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="flex gap-2">
            <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Nome (ex: Energia elétrica)" className={`${campo} flex-1`} />
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Adicionar
            </button>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>

        {!categorias && <p className="text-sm text-neutral-400">Carregando...</p>}
        {(["RECEITA", "DESPESA"] as const).map((tipo) => (
          <div key={tipo} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{tipo === "RECEITA" ? "Receitas" : "Despesas"}</p>
            {porGrupo((categorias ?? []).filter((c) => c.tipo === tipo)).map(([grupo, cs]) => (
              <div key={grupo}>
                <p className="text-sm font-medium mb-1">{grupo}</p>
                <ul className="flex flex-col">
                  {cs.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-t border-neutral-100 py-1.5 text-sm">
                      <span className={c.ativa ? "" : "text-neutral-400 line-through"}>{c.nome}</span>
                      <span className="flex gap-3 text-xs">
                        {c.ativa ? (
                          <>
                            <button onClick={() => renomear(c)} className="text-accent hover:underline">
                              Renomear
                            </button>
                            <button onClick={() => remover(c)} className="text-red-600 hover:underline">
                              Remover
                            </button>
                          </>
                        ) : (
                          <button onClick={() => reativar(c)} className="text-accent hover:underline">
                            Reativar
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </aside>
    </div>
  );
}
