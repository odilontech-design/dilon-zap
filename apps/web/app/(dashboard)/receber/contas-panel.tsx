"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { LISTING_INTERVAL } from "@/lib/polling";
import { centsToBRL } from "@/lib/billing";
import { ContaDrawer, EditarParcelaModal } from "./conta-drawer";
import { NovaContaModal } from "./nova-conta-modal";
import { ReceberModal } from "./receber-modal";
import {
  dataPagamento,
  dataVencimento,
  fetcher,
  nomeDoContato,
  ROTULO_STATUS,
  ROTULO_TIPO,
  type Faixa,
  type LinhaParcela,
  type StatusParcela,
} from "./formatos";

type Resposta = {
  linhas: LinhaParcela[];
  resumo: Record<Faixa | "total", number>;
  totais: { registros: number; valorCents: number; saldoCents: number };
};

const STATUS_OPCOES: StatusParcela[] = ["PENDENTE", "PAGA", "CANCELADA", "REEMBOLSADA"];

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
 * Contas a receber, uma linha por parcela — o mesmo desenho da tela do SmartPOS
 * (filtros, parcela "n de N", tipo de pagamento, total no rodapé), com o que o
 * ERP não tem: a conversa com o cliente a um clique, o vencimento que alimenta
 * o aviso ao financeiro e o recebimento que cai no caixa sozinho.
 */
export function ContasPanel() {
  const router = useRouter();
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [tipoData, setTipoData] = useState<"vencimento" | "pagamento">("vencimento");
  const [cliente, setCliente] = useState("");
  const [status, setStatus] = useState<StatusParcela[]>(["PENDENTE"]);
  const [tipo, setTipo] = useState("");
  const [faixa, setFaixa] = useState<Faixa | "">("");

  const [nova, setNova] = useState(false);
  const [recebendo, setRecebendo] = useState<LinhaParcela | null>(null);
  const [editando, setEditando] = useState<LinhaParcela | null>(null);
  const [detalhe, setDetalhe] = useState<{ contaId: string; parcelaId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const url = useMemo(() => {
    const q = new URLSearchParams({ tipoData, status: status.join(",") });
    if (desde) q.set("desde", desde);
    if (ate) q.set("ate", ate);
    if (cliente.trim()) q.set("cliente", cliente.trim());
    if (tipo) q.set("tipo", tipo);
    return `/api/contas-receber?${q}`;
  }, [desde, ate, tipoData, cliente, status, tipo]);

  const { data, error, mutate } = useSWR<Resposta>(url, fetcher, { refreshInterval: LISTING_INTERVAL, keepPreviousData: true });

  function alternarStatus(s: StatusParcela) {
    setStatus((atual) => {
      const novo = atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s];
      // Sem nenhum marcado a lista ficaria sempre vazia: volta ao padrão.
      return novo.length ? novo : ["PENDENTE"];
    });
  }

  async function abrirConversa(l: LinhaParcela) {
    setErro(null);
    const res = await fetch(`/api/contacts/${l.contato.id}/start-conversation`, { method: "POST" });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(typeof corpo.error === "string" ? corpo.error : "não deu pra abrir a conversa");
    router.push(`/inbox?open=${corpo.id}`);
  }

  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const linhas = faixa ? data.linhas.filter((l) => l.faixa === faixa) : data.linhas;
  const totalValor = linhas.reduce((s, l) => s + l.valorCents, 0);
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";

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
            <p className="text-[11px] text-neutral-500">Em aberto</p>
            <p className="text-base font-semibold tabular-nums">{centsToBRL(data.resumo.total)}</p>
          </div>
        </div>
        <button onClick={() => setNova(true)} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Nova conta a receber
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
        <label className="text-[11px] text-neutral-500">
          Cliente
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome ou telefone" className={`${campo} block mt-0.5 w-48`} />
        </label>
        <label className="text-[11px] text-neutral-500">
          Tipo de pagamento
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${campo} block mt-0.5`}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
        {(desde || ate || cliente || tipo || faixa || status.join() !== "PENDENTE") && (
          <button
            onClick={() => {
              setDesde("");
              setAte("");
              setCliente("");
              setTipo("");
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

      {erro && <p className="text-sm text-red-600 mb-2">{erro}</p>}

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cliente</th>
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
                  <p className="font-medium truncate max-w-[220px]">{nomeDoContato(l.contato)}</p>
                  <p className="text-[11px] text-neutral-400">{l.origem === "PEDIDO" ? `Pedido #${l.pedidoNumero}` : (l.descricao ?? "Conta avulsa")}</p>
                </td>
                <td className="px-3 py-2.5">
                  {dataVencimento(l.vencimento)}
                  {l.faixa === "vencido" && <p className="text-[11px] text-red-600">há {l.diasAtraso} dia(s)</p>}
                  {l.faixa === "vence_hoje" && <p className="text-[11px] text-amber-700">hoje</p>}
                </td>
                <td className="px-3 py-2.5">{dataPagamento(l.pagaEm)}</td>
                <td className="px-3 py-2.5 uppercase">{ROTULO_TIPO[l.tipo]}</td>
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
                      <button onClick={() => setRecebendo(l)} className="text-accent font-medium hover:underline">
                        Receber
                      </button>
                    )}
                    <button onClick={() => abrirConversa(l)} className="text-neutral-500 hover:text-accent" title="Abrir conversa">
                      WhatsApp
                    </button>
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
        <NovaContaModal
          onFechar={() => setNova(false)}
          onCriada={() => {
            setNova(false);
            mutate();
          }}
        />
      )}
      {recebendo && (
        <ReceberModal
          parcelaId={recebendo.id}
          titulo={`${nomeDoContato(recebendo.contato)} · ${recebendo.numero} de ${recebendo.totalParcelas}`}
          saldoCents={recebendo.saldoCents}
          onFechar={() => setRecebendo(null)}
          onRecebido={() => {
            setRecebendo(null);
            mutate();
          }}
        />
      )}
      {editando && (
        <EditarParcelaModal
          parcela={{ id: editando.id, vencimento: editando.vencimento, valorCents: editando.valorCents, observacao: null, pagoCents: editando.pagoCents }}
          podeMudarValor={editando.origem === "MANUAL"}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
        />
      )}
      {detalhe && <ContaDrawer contaId={detalhe.contaId} focoParcelaId={detalhe.parcelaId} onFechar={() => setDetalhe(null)} onMudou={() => mutate()} />}
    </div>
  );
}
