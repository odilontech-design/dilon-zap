"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { numeroOS } from "@/lib/otica-regras";
import type { LinhaDeRanking, PontoDoPeriodo, ResumoDoHistorico } from "@/lib/otica-historico";
import { erroDaResposta, fetcher } from "./formatos";

/**
 * Histórico das OS com filtros e indicadores (Visuallis, 23/11): o lugar para
 * consultar o que já foi entregue ou cancelado e entender os números — no
 * Financeiro a consulta existia, mas sem indicadores do que estava filtrado.
 *
 * Os cartões, os quadros e a lista vêm da MESMA resposta, do mesmo conjunto
 * filtrado: o número em cima sempre bate com a lista embaixo.
 */

type Linha = {
  id: string;
  numero: number;
  etapa: "ENTREGUE" | "CANCELADA";
  historica: boolean;
  fotoKey: string | null;
  lentes: string | null;
  armacao: string | null;
  contact: { id: string; name: string | null; waName: string | null; phoneNumber: string | null };
  data: string;
  valorCents: number;
  recebidoCents: number;
  saldoCents: number;
  semLancamento: boolean;
  dataSuspeita: { vizinhasPor: string; sugestoes: string[] } | null;
};

type Resposta = {
  resumo: ResumoDoHistorico;
  serie: { granularidade: "mes" | "ano"; pontos: PontoDoPeriodo[] };
  porLaboratorio: LinhaDeRanking[];
  porConsultor: LinhaDeRanking[];
  porMaterial: LinhaDeRanking[];
  opcoes: { laboratorios: { id: string; nome: string }[]; consultores: { id: string; nome: string }[] };
  ordens: Linha[];
  totalDeOrdens: number;
  totalDatasSuspeitas: number;
  limitado: boolean;
};

type Filtros = {
  de: string;
  ate: string;
  situacao: "todas" | "entregues" | "canceladas";
  laboratorioId: string;
  consultorId: string;
  origem: "todas" | "papel" | "sistema";
  financeiro: "todas" | "quitadas" | "com-saldo" | "sem-lancamento";
  datas: "todas" | "suspeitas";
};

const LIMPOS: Filtros = { de: "", ate: "", situacao: "todas", laboratorioId: "", consultorId: "", origem: "todas", financeiro: "todas", datas: "todas" };

const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Atalhos de período, no relógio de quem está olhando (a equipe está em Brasília). */
const PERIODOS: { id: string; rotulo: string; intervalo: () => { de: string; ate: string } }[] = [
  { id: "mes", rotulo: "Este mês", intervalo: () => { const a = new Date(); return { de: dia(new Date(a.getFullYear(), a.getMonth(), 1)), ate: dia(a) }; } },
  { id: "mes-passado", rotulo: "Mês passado", intervalo: () => { const a = new Date(); return { de: dia(new Date(a.getFullYear(), a.getMonth() - 1, 1)), ate: dia(new Date(a.getFullYear(), a.getMonth(), 0)) }; } },
  { id: "12m", rotulo: "Últimos 12 meses", intervalo: () => { const a = new Date(); return { de: dia(new Date(a.getFullYear() - 1, a.getMonth(), a.getDate() + 1)), ate: dia(a) }; } },
  { id: "ano", rotulo: "Este ano", intervalo: () => { const a = new Date(); return { de: dia(new Date(a.getFullYear(), 0, 1)), ate: dia(a) }; } },
  { id: "tudo", rotulo: "Todo o período", intervalo: () => ({ de: "", ate: "" }) },
];

function Cartao({ rotulo, valor, nota, alerta = false }: { rotulo: string; valor: string; nota?: ReactNode; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-3">
      <p className="text-xs text-neutral-500 mb-0.5">{rotulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${alerta ? "text-amber-700" : ""}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-500">{nota}</p>}
    </div>
  );
}

function Ranking({ titulo, linhas }: { titulo: string; linhas: LinhaDeRanking[] }) {
  const maior = Math.max(1, ...linhas.map((l) => l.faturamentoCents));
  return (
    <section className="rounded-lg border border-neutral-200 bg-surface p-3">
      <h3 className="mb-2 text-xs font-medium text-neutral-700">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-neutral-500">Sem OS entregues neste filtro.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => (
            <li key={l.nome} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate">{l.nome}</span>
                <span className="shrink-0 tabular-nums text-neutral-700">
                  {centsToBRL(l.faturamentoCents)} · {l.entregues} OS
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.max(2, (l.faturamentoCents / maior) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Serie({ pontos, granularidade }: { pontos: PontoDoPeriodo[]; granularidade: "mes" | "ano" }) {
  if (pontos.length === 0) return null;
  const maior = Math.max(1, ...pontos.map((p) => p.faturamentoCents));
  const total = pontos.reduce((s, p) => s + p.faturamentoCents, 0);
  return (
    <section className="rounded-lg border border-neutral-200 bg-surface p-3">
      <h3 className="mb-3 text-xs font-medium text-neutral-700">
        Faturamento por {granularidade === "ano" ? "ano" : "mês"} <span className="font-normal text-neutral-500">· OS entregues, pela data da entrega</span>
      </h3>
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label={`Faturamento por ${granularidade === "ano" ? "ano" : "mês"}: ${pontos.map((p) => `${p.rotulo} ${centsToBRL(p.faturamentoCents)}`).join(", ")}`}
          className="flex items-end gap-1.5 min-w-max h-40"
        >
          {pontos.map((p) => (
            <div key={p.chave} className="flex flex-col items-center justify-end h-full w-14 shrink-0" title={`${p.rotulo}: ${centsToBRL(p.faturamentoCents)} em ${p.entregues} OS`}>
              <span className="mb-1 text-[10px] tabular-nums text-neutral-600">{p.faturamentoCents ? centsToBRL(p.faturamentoCents).replace(/\s/g, " ") : "—"}</span>
              <div className="w-full rounded-t bg-accent/70" style={{ height: `${p.faturamentoCents ? Math.max(3, (p.faturamentoCents / maior) * 100) : 0}%` }} />
              <span className="mt-1 text-[10px] text-neutral-500">{p.rotulo}</span>
              <span className="text-[10px] tabular-nums text-neutral-400">{p.entregues} OS</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Total do gráfico: <span className="tabular-nums font-medium text-neutral-700">{centsToBRL(total)}</span>
      </p>
    </section>
  );
}

const DIA_BR = (iso: string) => iso.split("-").reverse().join("/");

/**
 * A data de uma OS, com o editor para corrigi-la. Só as OS do papel se corrigem aqui: a leitura por IA
 * erra ano e mês, e a OS feita no sistema nasce com a data certa. Quando a data foge da sequência do
 * talão, o sistema avisa e oferece a data provável a um clique (nunca troca sozinho).
 */
function CelulaDeData({ o, fuso, onSalvou }: { o: Linha; fuso?: string; onSalvou: () => void }) {
  const atual = new Date(o.data).toLocaleDateString("en-CA", { timeZone: fuso });
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(atual);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(valor: string) {
    if (!valor || valor === atual) return setAberto(false);
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/otica/os/${o.id}/data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dia: valor }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    setAberto(false);
    onSalvou();
  }

  const suspeita = o.dataSuspeita;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular-nums">{new Date(o.data).toLocaleDateString("pt-BR", { timeZone: fuso })}</span>
        {suspeita && (
          <span
            className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800"
            title={`As OS de número vizinho são de ${DIA_BR(suspeita.vizinhasPor)}. Essa data pode ter sido lida errado do talão.`}
          >
            conferir
          </span>
        )}
        {o.historica && !aberto && (
          <button
            type="button"
            onClick={() => {
              setDia(atual);
              setErro(null);
              setAberto(true);
            }}
            className="text-[11px] text-accent hover:underline"
            aria-label={`Corrigir a data da OS ${numeroOS(o.numero)}`}
          >
            corrigir
          </button>
        )}
      </div>
      {aberto && (
        <div className="flex flex-col items-start gap-1.5 rounded-md border border-neutral-200 bg-surface p-2 shadow-sm">
          {suspeita && suspeita.sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suspeita.sugestoes.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  disabled={salvando}
                  onClick={() => salvar(sug)}
                  className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-white disabled:opacity-50"
                >
                  Usar {DIA_BR(sug)}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar(dia);
                if (e.key === "Escape") setAberto(false);
              }}
              aria-label={`Nova data da OS ${numeroOS(o.numero)}`}
              className="rounded-md border border-neutral-300 bg-surface px-2 py-1 text-xs"
              autoFocus
            />
            <button type="button" disabled={salvando || !dia} onClick={() => salvar(dia)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-neutral-500 hover:text-neutral-800">
              Cancelar
            </button>
          </div>
          {o.dataSuspeita === null && o.historica && <p className="max-w-[240px] text-[10px] text-neutral-500">Corrige a OS e também o vencimento e o pagamento dela no Financeiro.</p>}
          {erro && <p role="alert" className="max-w-[240px] text-[11px] text-red-700">{erro}</p>}
        </div>
      )}
    </div>
  );
}

export function HistoricoDeOS({ fuso }: { fuso?: string }) {
  const [f, setF] = useState<Filtros>(LIMPOS);
  const [atalho, setAtalho] = useState<string>("tudo");

  const q = new URLSearchParams();
  if (f.de) q.set("de", f.de);
  if (f.ate) q.set("ate", f.ate);
  if (f.situacao !== "todas") q.set("situacao", f.situacao);
  if (f.laboratorioId) q.set("laboratorioId", f.laboratorioId);
  if (f.consultorId) q.set("consultorId", f.consultorId);
  if (f.origem !== "todas") q.set("origem", f.origem);
  if (f.financeiro !== "todas") q.set("financeiro", f.financeiro);
  if (f.datas === "suspeitas") q.set("datas", "suspeitas");

  const { data, error, isLoading, mutate } = useSWR<Resposta>(`/api/otica/os/historico?${q.toString()}`, fetcher, { keepPreviousData: true });

  const filtrando = JSON.stringify(f) !== JSON.stringify(LIMPOS);
  const mudar = (parcial: Partial<Filtros>) => setF((a) => ({ ...a, ...parcial }));
  const campo = "rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-xs";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-neutral-200 bg-surface p-3 flex flex-col gap-3" aria-label="Filtros do histórico">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={atalho === p.id}
              onClick={() => {
                setAtalho(p.id);
                mudar(p.intervalo());
              }}
              className={`rounded-full px-3 py-1 text-xs ${atalho === p.id ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600 hover:text-neutral-900"}`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label>
            <span className="block text-neutral-500 mb-1">Entrega de</span>
            <input type="date" value={f.de} onChange={(e) => { setAtalho("personalizado"); mudar({ de: e.target.value }); }} className={campo} />
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">até</span>
            <input type="date" value={f.ate} onChange={(e) => { setAtalho("personalizado"); mudar({ ate: e.target.value }); }} className={campo} />
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">Situação</span>
            <select value={f.situacao} onChange={(e) => mudar({ situacao: e.target.value as Filtros["situacao"] })} className={campo}>
              <option value="todas">Entregues e canceladas</option>
              <option value="entregues">Só entregues</option>
              <option value="canceladas">Só canceladas</option>
            </select>
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">Laboratório</span>
            <select value={f.laboratorioId} onChange={(e) => mudar({ laboratorioId: e.target.value })} className={campo}>
              <option value="">Todos</option>
              {data?.opcoes.laboratorios.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">Consultor</span>
            <select value={f.consultorId} onChange={(e) => mudar({ consultorId: e.target.value })} className={campo}>
              <option value="">Todos</option>
              {data?.opcoes.consultores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">Origem</span>
            <select value={f.origem} onChange={(e) => mudar({ origem: e.target.value as Filtros["origem"] })} className={campo}>
              <option value="todas">Todas</option>
              <option value="papel">Do talão de papel</option>
              <option value="sistema">Feitas no sistema</option>
            </select>
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">Pagamento</span>
            <select value={f.financeiro} onChange={(e) => mudar({ financeiro: e.target.value as Filtros["financeiro"] })} className={campo}>
              <option value="todas">Todos</option>
              <option value="quitadas">Quitadas</option>
              <option value="com-saldo">Com saldo a receber</option>
              <option value="sem-lancamento">Sem lançamento no Financeiro</option>
            </select>
          </label>
          {filtrando && (
            <button
              type="button"
              onClick={() => { setF(LIMPOS); setAtalho("tudo"); }}
              className="pb-1.5 text-xs text-accent hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading && !data && <p className="text-sm text-neutral-500">Carregando…</p>}

      {data && data.resumo.total === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {filtrando ? "Nenhuma OS neste filtro. Tente ampliar o período ou limpar os filtros." : "Nenhuma OS entregue ou cancelada ainda."}
        </div>
      )}

      {data && data.resumo.total > 0 && (
        <>
          {(data.totalDatasSuspeitas > 0 || f.datas === "suspeitas") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              <span>
                {data.totalDatasSuspeitas} OS do papel com data fora da sequência do talão, provavelmente lida errado pela IA. Confira o ano e o mês e corrija na coluna Data.
              </span>
              <button
                type="button"
                aria-pressed={f.datas === "suspeitas"}
                onClick={() => mudar({ datas: f.datas === "suspeitas" ? "todas" : "suspeitas" })}
                className="rounded-full bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
              >
                {f.datas === "suspeitas" ? "Ver todas as OS" : "Ver só as suspeitas"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Cartao
              rotulo="OS no filtro"
              valor={String(data.resumo.total)}
              nota={`${data.resumo.entregues} entregue(s)${data.resumo.canceladas ? ` · ${data.resumo.canceladas} cancelada(s)` : ""}`}
            />
            <Cartao rotulo="Faturamento" valor={centsToBRL(data.resumo.faturamentoCents)} nota="valor das entregues" />
            <Cartao rotulo="Ticket médio" valor={centsToBRL(data.resumo.ticketMedioCents)} nota="por OS entregue" />
            <Cartao rotulo="Recebido" valor={centsToBRL(data.resumo.recebidoCents)} nota="já pago pelos clientes" />
            <Cartao
              rotulo="A receber"
              valor={centsToBRL(data.resumo.saldoCents)}
              alerta={data.resumo.saldoCents > 0}
              nota={data.resumo.entreguesComSaldo ? `${data.resumo.entreguesComSaldo} OS com saldo` : "nada em aberto"}
            />
            <Cartao
              rotulo="Cancelamentos"
              valor={data.resumo.taxaDeCancelamento === null ? "—" : `${data.resumo.taxaDeCancelamento}%`}
              nota={`${data.resumo.canceladas} de ${data.resumo.total} OS`}
            />
          </div>

          {data.resumo.semLancamento > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              {data.resumo.semLancamento} OS entregue(s) somam {centsToBRL(data.resumo.semLancamentoCents)} no faturamento mas não têm lançamento no
              Financeiro, então não aparecem em Recebido nem em A receber. Faturamento = Recebido + A receber + Sem lançamento. Use o filtro
              &quot;Sem lançamento no Financeiro&quot; para listá-las.
            </p>
          )}

          <Serie pontos={data.serie.pontos} granularidade={data.serie.granularidade} />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Ranking titulo="Por laboratório" linhas={data.porLaboratorio} />
            <Ranking titulo="Por consultor" linhas={data.porConsultor} />
            <Ranking titulo="Por material da lente" linhas={data.porMaterial} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="px-3 py-2 font-medium">OS</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-right font-medium">Recebido</th>
                  <th className="px-3 py-2 text-right font-medium">A receber</th>
                </tr>
              </thead>
              <tbody>
                {data.ordens.map((o) => (
                  <tr key={o.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2 font-medium tabular-nums">
                      <Link href={`/otica/os/${o.id}`} className="hover:text-accent">{numeroOS(o.numero)}</Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/otica/os/${o.id}`} className="hover:text-accent">{o.contact.name || o.contact.waName || o.contact.phoneNumber || "Sem nome"}</Link>
                      {(o.lentes || o.armacao) && <span className="block text-xs text-neutral-500 line-clamp-1">{[o.lentes, o.armacao].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className={o.etapa === "CANCELADA" ? "text-red-700" : "text-neutral-700"}>{o.etapa === "CANCELADA" ? "Cancelada" : "Entregue"}</span>
                      {o.historica && <span className="ml-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">do papel</span>}
                      {o.fotoKey && <span className="ml-1.5 text-neutral-400" title="Tem foto do talão">foto</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500 align-top"><CelulaDeData o={o} fuso={fuso} onSalvou={() => mutate()} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.valorCents ? centsToBRL(o.valorCents) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {o.etapa === "CANCELADA" ? "—" : o.semLancamento ? <span className="text-amber-700">sem lançamento</span> : centsToBRL(o.recebidoCents)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs ${o.saldoCents > 0 ? "font-medium text-amber-700" : "text-neutral-400"}`}>
                      {o.etapa === "CANCELADA" || o.semLancamento ? "—" : centsToBRL(o.saldoCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-neutral-800 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Número de OS: <b className="tabular-nums">{data.resumo.total}</b>
              {data.limitado && <span className="ml-2 text-xs text-neutral-300">(a lista mostra as {data.ordens.length} mais recentes; os totais contam todas)</span>}
            </span>
            <span>
              Faturamento <b className="tabular-nums ml-1">{centsToBRL(data.resumo.faturamentoCents)}</b>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
