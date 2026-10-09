"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { LISTING_INTERVAL } from "@/lib/polling";
import { centsToBRL } from "@/lib/billing";
import { dataPagamento, dataVencimento, fetcher, ROTULO_STATUS, type Faixa, type StatusParcela } from "../receber/formatos";
import { ContaPagarDrawer } from "./conta-pagar-drawer";
import { EditarParcelaPagarModal, EscolherFornecedor, NovaContaPagarModal, PagarModal, ROTULO_FORMA, type FormaPagar } from "./pagar-modais";

type Linha = {
  id: string;
  contaId: string;
  descricao: string | null;
  fornecedor: { id: string; nome: string };
  vencimento: string | null;
  pagoEm: string | null;
  forma: FormaPagar;
  numero: number;
  totalParcelas: number;
  status: StatusParcela;
  valorCents: number;
  pagoCents: number;
  saldoCents: number;
  faixa: Faixa | null;
  diasAtraso: number;
};

type Resposta = {
  linhas: Linha[];
  resumo: Record<Faixa | "total", number>;
  totais: { registros: number; valorCents: number; saldoCents: number };
};

const STATUS_OPCOES: StatusParcela[] = ["PENDENTE", "PAGA", "CANCELADA", "REEMBOLSADA"];
const FORMAS = Object.keys(ROTULO_FORMA) as FormaPagar[];

const CARTOES: { faixa: Faixa; rotulo: string; classe: string }[] = [
  { faixa: "vencido", rotulo: "Vencido", classe: "border-red-200 bg-red-50 text-red-700" },
  { faixa: "vence_hoje", rotulo: "Vence hoje", classe: "border-amber-200 bg-amber-50 text-amber-800" },
  { faixa: "a_vencer", rotulo: "A vencer", classe: "border-neutral-200 bg-surface text-neutral-700" },
  { faixa: "sem_prazo", rotulo: "Sem prazo", classe: "border-neutral-200 bg-surface text-neutral-600" },
];

const COR_STATUS: Record<StatusParcela, string> = {
  PENDENTE: "text-amber-700",
  PAGA: "text-green-700",
  CANCELADA: "text-neutral-400",
  REEMBOLSADA: "text-sky-700",
};

/**
 * Contas a pagar, uma linha por parcela — o desenho da tela do SmartPOS:
 * fornecedor, vencimento, pagamento, tipo de pagamento (a forma: boleto, PIX...),
 * status, "2 de 3", valor, e o total no rodapé. O que o ERP não faz: o
 * pagamento em dinheiro sai da gaveta do caixa aberto sozinho.
 */
export function PagarPanel() {
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [tipoData, setTipoData] = useState<"vencimento" | "pagamento">("vencimento");
  const [fornecedor, setFornecedor] = useState<{ id: string | null; nome: string }>({ id: null, nome: "" });
  const [status, setStatus] = useState<StatusParcela[]>(["PENDENTE"]);
  const [forma, setForma] = useState("");
  const [faixa, setFaixa] = useState<Faixa | "">("");

  const [nova, setNova] = useState(false);
  const [pagando, setPagando] = useState<Linha | null>(null);
  const [editando, setEditando] = useState<Linha | null>(null);
  const [detalhe, setDetalhe] = useState<{ contaId: string; parcelaId: string } | null>(null);

  const url = useMemo(() => {
    const q = new URLSearchParams({ tipoData, status: status.join(",") });
    if (desde) q.set("desde", desde);
    if (ate) q.set("ate", ate);
    if (fornecedor.nome.trim()) q.set("fornecedor", fornecedor.nome.trim());
    if (forma) q.set("forma", forma);
    return `/api/contas-pagar?${q}`;
  }, [desde, ate, tipoData, fornecedor.nome, status, forma]);

  const { data, error, mutate } = useSWR<Resposta>(url, fetcher, { refreshInterval: LISTING_INTERVAL, keepPreviousData: true });

  function alternarStatus(s: StatusParcela) {
    setStatus((atual) => {
      const novo = atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s];
      return novo.length ? novo : ["PENDENTE"];
    });
  }

  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const linhas = faixa ? data.linhas.filter((l) => l.faixa === faixa) : data.linhas;
  const totalValor = linhas.reduce((s, l) => s + l.valorCents, 0);
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";
  const filtrando = desde || ate || fornecedor.nome || forma || faixa || status.join() !== "PENDENTE" || tipoData !== "vencimento";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CARTOES.map((c) => (
            <button
              key={c.faixa}
              onClick={() => {
                setStatus(["PENDENTE"]);
                setFaixa((f) => (f === c.faixa ? "" : c.faixa));
              }}
              className={`rounded-lg border px-3 py-2 text-left min-w-[140px] ${c.classe} ${faixa === c.faixa ? "ring-2 ring-accent" : ""}`}
              title="Clique para filtrar a lista"
            >
              <p className="text-[11px]">{c.rotulo}</p>
              <p className="text-base font-semibold tabular-nums">{centsToBRL(data.resumo[c.faixa])}</p>
            </button>
          ))}
          <div className="rounded-lg border border-neutral-300 bg-surface px-3 py-2 min-w-[140px]">
            <p className="text-[11px] text-neutral-500">Total a pagar</p>
            <p className="text-base font-semibold tabular-nums">{centsToBRL(data.resumo.total)}</p>
          </div>
        </div>
        <button onClick={() => setNova(true)} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Nova conta a pagar
        </button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface p-3 mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-[11px] text-neutral-500">
          Data inicial
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-[11px] text-neutral-500">
          Data final
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-[11px] text-neutral-500">
          Tipo da data
          <select value={tipoData} onChange={(e) => setTipoData(e.target.value as typeof tipoData)} className={`${campo} block mt-0.5`}>
            <option value="vencimento">Vencimento</option>
            <option value="pagamento">Pagamento</option>
          </select>
        </label>
        <div className="text-[11px] text-neutral-500 w-56">
          Fornecedor
          <div className="mt-0.5 flex items-start gap-1">
            <div className="flex-1">
              <EscolherFornecedor valor={fornecedor} onChange={setFornecedor} />
            </div>
            {fornecedor.nome && (
              <button onClick={() => setFornecedor({ id: null, nome: "" })} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50" title="Limpar fornecedor" aria-label="Limpar fornecedor">
                ×
              </button>
            )}
          </div>
        </div>
        <label className="text-[11px] text-neutral-500">
          Tipo de pagamento
          <select value={forma} onChange={(e) => setForma(e.target.value)} className={`${campo} block mt-0.5`}>
            <option value="">Todos</option>
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FORMA[f]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {STATUS_OPCOES.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" checked={status.includes(s)} onChange={() => alternarStatus(s)} />
              {ROTULO_STATUS[s]}
            </label>
          ))}
        </div>
        {filtrando && (
          <button
            onClick={() => {
              setDesde("");
              setAte("");
              setFornecedor({ id: null, nome: "" });
              setForma("");
              setFaixa("");
              setStatus(["PENDENTE"]);
              setTipoData("vencimento");
            }}
            className="text-xs text-accent hover:underline pb-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Fornecedor</th>
              <th className="text-left px-3 py-2 font-medium">Vencimento</th>
              <th className="text-left px-3 py-2 font-medium">Pagamento</th>
              <th className="text-left px-3 py-2 font-medium">Tipo pagamento</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Parcelas</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-neutral-400">
                  Nenhuma parcela neste filtro.
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium truncate max-w-[220px]">{l.fornecedor.nome}</p>
                  {l.descricao && <p className="text-[11px] text-neutral-400 truncate max-w-[220px]">{l.descricao}</p>}
                </td>
                <td className="px-3 py-2.5">
                  {dataVencimento(l.vencimento)}
                  {l.faixa === "vencido" && <p className="text-[11px] text-red-600">há {l.diasAtraso} dia(s)</p>}
                  {l.faixa === "vence_hoje" && <p className="text-[11px] text-amber-700">hoje</p>}
                </td>
                <td className="px-3 py-2.5">{dataPagamento(l.pagoEm)}</td>
                <td className="px-3 py-2.5 uppercase">{ROTULO_FORMA[l.forma]}</td>
                <td className={`px-3 py-2.5 font-medium ${COR_STATUS[l.status]}`}>
                  {ROTULO_STATUS[l.status]}
                  {l.status === "PENDENTE" && l.pagoCents > 0 && <p className="text-[11px] font-normal text-neutral-500">falta {centsToBRL(l.saldoCents)}</p>}
                </td>
                <td className="px-3 py-2.5">
                  {l.numero} de {l.totalParcelas}
                </td>
                <td className="px-3 py-2.5 text-right">{centsToBRL(l.valorCents)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    {l.status === "PENDENTE" && (
                      <button onClick={() => setPagando(l)} className="text-accent font-medium hover:underline">
                        Pagar
                      </button>
                    )}
                    {(l.status === "PENDENTE" || l.status === "PAGA") && (
                      <button onClick={() => setEditando(l)} className="text-neutral-500 hover:text-accent" title="Editar parcela">
                        Editar
                      </button>
                    )}
                    <button onClick={() => setDetalhe({ contaId: l.contaId, parcelaId: l.id })} className="text-neutral-500 hover:text-accent">
                      Detalhes
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-lg bg-neutral-800 text-white px-5 py-3 flex items-center justify-between text-sm">
        <span>
          Número de registros: <b className="tabular-nums">{linhas.length}</b>
        </span>
        <span>
          Total <b className="tabular-nums ml-1">{centsToBRL(totalValor)}</b>
        </span>
      </div>

      {nova && (
        <NovaContaPagarModal
          onFechar={() => setNova(false)}
          onCriada={() => {
            setNova(false);
            mutate();
          }}
        />
      )}
      {pagando && (
        <PagarModal
          parcelaId={pagando.id}
          titulo={`${pagando.fornecedor.nome} · ${pagando.numero} de ${pagando.totalParcelas}`}
          saldoCents={pagando.saldoCents}
          formaPrevista={pagando.forma}
          onFechar={() => setPagando(null)}
          onPago={() => {
            setPagando(null);
            mutate();
          }}
        />
      )}
      {editando && (
        <EditarParcelaPagarModal
          parcela={{ id: editando.id, vencimento: editando.vencimento, valorCents: editando.valorCents, forma: editando.forma, observacao: null }}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
        />
      )}
      {detalhe && <ContaPagarDrawer contaId={detalhe.contaId} focoParcelaId={detalhe.parcelaId} onFechar={() => setDetalhe(null)} onMudou={() => mutate()} />}
    </div>
  );
}
