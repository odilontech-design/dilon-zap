"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { formatarTaxa } from "@/lib/funil-indicadores";
import type { LinhaDoMes, MesInformado, TotalDaJanela } from "@/lib/saas-indicadores";

type Resposta = {
  funil: { id: string; nome: string };
  funis: { id: string; nome: string }[];
  etapas: { id: string; name: string }[];
  etapaSqlId: string | null;
  meses: LinhaDoMes[];
  total: TotalDaJanela;
  informados: MesInformado[];
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "erro");
  return body;
};

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes: string) => `${MESES_ABREV[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const numero = (n: number) => n.toLocaleString("pt-BR");
const dinheiro = (c: number | null) => (c === null ? "—" : centsToBRL(c));
const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")}x`);

function Cartao({ titulo, valor, ajuda }: { titulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 min-w-[150px]">
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {ajuda && <p className="text-[11px] text-neutral-400">{ajuda}</p>}
    </div>
  );
}

export function SaasPanel() {
  const [funilId, setFunilId] = useState("");
  const [janela, setJanela] = useState(6);
  const [etapaSqlId, setEtapaSqlId] = useState("");
  const [editando, setEditando] = useState<LinhaDoMes | null>(null);

  const q = new URLSearchParams({ meses: String(janela) });
  if (funilId) q.set("funilId", funilId);
  if (etapaSqlId) q.set("etapaSqlId", etapaSqlId);

  const { data, error, mutate } = useSWR<Resposta>(`/api/saas?${q}`, fetcher, { keepPreviousData: true });

  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const t = data.total;
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";
  const semDadosManuais = data.meses.every((m) => m.visitantes === 0 && m.investimentoCents === 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={data.funil.id} onChange={(e) => setFunilId(e.target.value)} className={`${campo} font-medium`}>
          {data.funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <select value={janela} onChange={(e) => setJanela(Number(e.target.value))} className={campo}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Qualificado (SQL) a partir de
          <select value={data.etapaSqlId ?? ""} onChange={(e) => setEtapaSqlId(e.target.value)} className={campo}>
            {data.etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {semDadosManuais && (
        <p className="text-sm text-neutral-600 rounded-lg border border-dashed border-neutral-300 px-4 py-3 mb-4">
          Visitantes e investimento em anúncios não vêm do sistema: informe-os mês a mês em <b>Editar</b>, na tabela abaixo.
          Sem eles, a conversão e o CAC ficam em branco; leads, clientes e MRR já saem das negociações.
        </p>
      )}

      {/* Funil de ponta a ponta */}
      <div className="rounded-lg border border-neutral-200 bg-surface p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Funil na janela</h2>
        <div className="flex items-stretch gap-2 overflow-x-auto">
          {(
            [
              ["Visitantes", t.visitantes, null],
              ["Leads", t.leads, t.conversaoVisitanteLead],
              ["SQLs", t.sqls, t.conversaoLeadSql],
              ["Clientes", t.clientes, t.conversaoSqlCliente],
            ] as [string, number, number | null][]
          ).map(([nome, valor, taxa], i) => (
            <div key={nome} className="flex items-center gap-2">
              {i > 0 && (
                <div className="text-center shrink-0">
                  <p className="text-[10px] text-neutral-400">→</p>
                  <p className="text-xs font-medium tabular-nums">{formatarTaxa(taxa)}</p>
                </div>
              )}
              <div className="rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3 min-w-[110px] text-center">
                <p className="text-xl font-semibold tabular-nums">{numero(valor)}</p>
                <p className="text-xs text-neutral-500">{nome}</p>
              </div>
            </div>
          ))}
          <div className="ml-auto text-right self-center shrink-0 pl-4">
            <p className="text-[11px] text-neutral-500">Conversão total</p>
            <p className="text-xl font-semibold tabular-nums">{formatarTaxa(t.conversaoTotal)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        <Cartao titulo="MRR atual" valor={dinheiro(t.mrrFimCents)} />
        <Cartao titulo="ARR" valor={dinheiro(t.arrCents)} ajuda="12 × MRR" />
        <Cartao titulo="Novo MRR (janela)" valor={dinheiro(t.novoMrrCents)} />
        <Cartao titulo="Churn mensal médio" valor={formatarTaxa(t.churnMedio)} ajuda="MRR cancelado / MRR do início" />
        <Cartao titulo="Ticket (MRR)" valor={dinheiro(t.ticketMrrCents)} />
        <Cartao titulo="CAC" valor={dinheiro(t.cacCents)} ajuda="investimento / clientes" />
        <Cartao titulo="LTV" valor={dinheiro(t.ltvCents)} ajuda={t.ltvCents === null ? "precisa de churn informado" : "ticket / churn"} />
        <Cartao titulo="LTV / CAC" valor={x(t.ltvSobreCac)} ajuda="saudável: acima de 3x" />
        <Cartao titulo="Payback" valor={t.paybackMeses === null ? "—" : `${t.paybackMeses.toFixed(1).replace(".", ",")} meses`} ajuda="CAC / ticket" />
      </div>

      <GraficoMrr meses={data.meses} />

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto mt-4">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {["Mês", "Visitantes", "Investimento", "Leads", "SQLs", "Clientes", "Novo MRR", "Cancelado", "MRR final", "Churn", "CAC", ""].map((h) => (
                <th key={h} className={`px-3 py-2 font-medium ${h === "Mês" || h === "" ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.meses.map((m) => (
              <tr key={m.mes} className="border-t border-neutral-100">
                <td className="px-3 py-2 font-medium">{rotuloMes(m.mes)}</td>
                <td className="px-3 py-2 text-right">{numero(m.visitantes)}</td>
                <td className="px-3 py-2 text-right">{dinheiro(m.investimentoCents)}</td>
                <td className="px-3 py-2 text-right">{numero(m.leads)}</td>
                <td className="px-3 py-2 text-right">{numero(m.sqls)}</td>
                <td className="px-3 py-2 text-right">{numero(m.clientes)}</td>
                <td className="px-3 py-2 text-right">{dinheiro(m.novoMrrCents)}</td>
                <td className="px-3 py-2 text-right">{dinheiro(m.mrrCanceladoCents)}</td>
                <td className="px-3 py-2 text-right font-medium">{dinheiro(m.mrrFimCents)}</td>
                <td className="px-3 py-2 text-right">{formatarTaxa(m.churn)}</td>
                <td className="px-3 py-2 text-right">{dinheiro(m.cacCents)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setEditando(m)} className="text-xs text-accent hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">
        Leads e SQLs são as negociações criadas no mês; clientes são as ganhas que fecharam no mês. MRR final = MRR do
        início + novo − cancelado. Venda de cobrança única conta como cliente, mas não entra no MRR.
      </p>

      {editando && (
        <EditarMes
          linha={editando}
          informado={data.informados.find((i) => i.mes === editando.mes)}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function GraficoMrr({ meses }: { meses: LinhaDoMes[] }) {
  const maior = Math.max(1, ...meses.map((m) => m.mrrFimCents));
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <h2 className="text-sm font-semibold mb-3">MRR no fim de cada mês</h2>
      <div className="flex items-end gap-2 h-32">
        {meses.map((m) => (
          <div key={m.mes} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full">
            <span className="text-[10px] text-neutral-500 tabular-nums truncate max-w-full">{dinheiro(m.mrrFimCents)}</span>
            <div className="w-full rounded-t bg-accent/80" style={{ height: `${Math.max(2, (m.mrrFimCents / maior) * 80)}%` }} />
            <span className="text-[10px] text-neutral-400">{rotuloMes(m.mes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function reais(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}
function paraCentavos(t: string): number | null {
  const limpo = t.trim().replace(/[R$\s]/g, "");
  if (!limpo) return 0;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function EditarMes({
  linha,
  informado,
  onFechar,
  onSalvo,
}: {
  linha: LinhaDoMes;
  informado: MesInformado | undefined;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [visitantes, setVisitantes] = useState(String(informado?.visitantes ?? 0));
  const [investimento, setInvestimento] = useState(reais(informado?.investimentoCents ?? 0));
  const [cancelamentos, setCancelamentos] = useState(String(informado?.cancelamentos ?? 0));
  const [mrrCancelado, setMrrCancelado] = useState(reais(informado?.mrrCanceladoCents ?? 0));
  const [mrrInicial, setMrrInicial] = useState(informado?.mrrInicialCents != null ? reais(informado.mrrInicialCents) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const inv = paraCentavos(investimento);
    const canc = paraCentavos(mrrCancelado);
    const ini = mrrInicial.trim() === "" ? null : paraCentavos(mrrInicial);
    const vis = Number(visitantes);
    const cli = Number(cancelamentos);
    if (inv === null || canc === null || (mrrInicial.trim() !== "" && ini === null)) return setErro("valor em reais inválido");
    if (!Number.isInteger(vis) || vis < 0 || !Number.isInteger(cli) || cli < 0) return setErro("use números inteiros");

    setSalvando(true);
    setErro(null);
    const res = await fetch("/api/saas/mes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mes: linha.mes,
        visitantes: vis,
        investimentoCents: inv,
        cancelamentos: cli,
        mrrCanceladoCents: canc,
        mrrInicialCents: ini,
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra salvar");
    }
    onSalvo();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={salvar} className="bg-surface rounded-lg p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-1">{rotuloMes(linha.mes)}</h2>
        <p className="text-xs text-neutral-500 mb-4">O que não nasce dentro do sistema, informado por você.</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Visitantes no site</label>
              <input value={visitantes} onChange={(e) => setVisitantes(e.target.value)} inputMode="numeric" className={campo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Investimento em anúncios (R$)</label>
              <input value={investimento} onChange={(e) => setInvestimento(e.target.value)} inputMode="decimal" className={campo} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Clientes que cancelaram</label>
              <input value={cancelamentos} onChange={(e) => setCancelamentos(e.target.value)} inputMode="numeric" className={campo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">MRR cancelado (R$)</label>
              <input value={mrrCancelado} onChange={(e) => setMrrCancelado(e.target.value)} inputMode="decimal" className={campo} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">MRR no início deste mês (R$) — opcional</label>
            <input value={mrrInicial} onChange={(e) => setMrrInicial(e.target.value)} inputMode="decimal" placeholder="deixe em branco para seguir o mês anterior" className={campo} />
            <p className="text-[11px] text-neutral-400 mt-1">
              Use uma vez, no primeiro mês, se você já tinha clientes antes de usar o funil: o MRR do sistema só enxerga o que foi vendido por ele.
            </p>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
