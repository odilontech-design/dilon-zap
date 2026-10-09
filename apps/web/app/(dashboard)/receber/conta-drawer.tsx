"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { gerarParcelas } from "@dilon-zap/receivables";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import {
  chamar,
  dataHoraBR,
  dataPagamento,
  dataVencimento,
  fetcher,
  hojeISO,
  nomeDoContato,
  ROTULO_MEIO,
  ROTULO_STATUS,
  ROTULO_TIPO,
  type StatusParcela,
  type TipoParcela,
} from "./formatos";
import { ReceberModal } from "./receber-modal";

type PagamentoDetalhe = { id: string; valorCents: number; meio: string | null; recebidoEm: string; observacao: string | null; por: string | null };

type ParcelaDetalhe = {
  id: string;
  numero: number;
  totalParcelas: number;
  tipo: TipoParcela;
  vencimento: string | null;
  valorCents: number;
  status: StatusParcela;
  pagoCents: number;
  saldoCents: number;
  pagaEm: string | null;
  observacao: string | null;
  pagamentos: PagamentoDetalhe[];
};

type Detalhe = {
  id: string;
  origem: "MANUAL" | "PEDIDO";
  descricao: string | null;
  canceladaEm: string | null;
  createdAt: string;
  contato: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
  pedido: { id: string; numero: number; conversationId: string | null; totalCents: number } | null;
  totalCents: number;
  saldoCents: number;
  parcelas: ParcelaDetalhe[];
};

const COR_STATUS: Record<StatusParcela, string> = {
  PENDENTE: "bg-amber-100 text-amber-800",
  PAGA: "bg-green-100 text-green-700",
  CANCELADA: "bg-neutral-100 text-neutral-500",
  REEMBOLSADA: "bg-sky-100 text-sky-700",
};

/**
 * Detalhes de uma conta: as parcelas, o que entrou em cada uma e o que dá para
 * fazer — receber, estornar, mudar a data, reparcelar, cancelar. As operações
 * que apagam dívida (cancelar, reembolsar, mudar valor) só existem em conta
 * avulsa: numa conta de pedido o total é o do pedido.
 */
export function ContaDrawer({
  contaId,
  focoParcelaId,
  onFechar,
  onMudou,
}: {
  contaId: string;
  focoParcelaId?: string | null;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<Detalhe>(`/api/contas-receber/${contaId}`, fetcher);
  const [recebendo, setRecebendo] = useState<ParcelaDetalhe | null>(null);
  const [editando, setEditando] = useState<ParcelaDetalhe | null>(null);
  const [reparcelando, setReparcelando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function recarregar() {
    mutate();
    onMudou();
  }

  async function acao(parcelaId: string, corpo: Record<string, unknown>, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return;
    setAviso(null);
    const r = await chamar(`/api/parcelas/${parcelaId}`, "PATCH", corpo);
    if (!r.ok) return setAviso(r.erro ?? "não deu pra concluir");
    recarregar();
  }

  async function cancelarConta() {
    if (!confirm("Cancelar esta conta inteira? As parcelas deixam de contar como a receber.")) return;
    setAviso(null);
    const r = await chamar(`/api/contas-receber/${contaId}`, "PATCH", { acao: "cancelar" });
    if (!r.ok) return setAviso(r.erro ?? "não deu pra cancelar");
    onMudou();
    onFechar();
  }

  async function abrirConversa() {
    if (!data) return;
    const res = await fetch(`/api/contacts/${data.contato.id}/start-conversation`, { method: "POST" });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) return setAviso(typeof corpo.error === "string" ? corpo.error : "não deu pra abrir a conversa");
    router.push(`/inbox?open=${corpo.id}`);
  }

  if (error) {
    return (
      <Casca onFechar={onFechar}>
        <p className="text-sm text-red-600">{error.message}</p>
      </Casca>
    );
  }
  if (!data) {
    return (
      <Casca onFechar={onFechar}>
        <p className="text-sm text-neutral-400">Carregando...</p>
      </Casca>
    );
  }

  const manual = data.origem === "MANUAL";
  const cancelada = !!data.canceladaEm;
  const podeReparcelar = !cancelada && data.parcelas.some((p) => p.status === "PENDENTE" && p.pagoCents === 0);

  return (
    <Casca onFechar={onFechar}>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-neutral-500">{manual ? "Conta avulsa" : `Pedido #${data.pedido?.numero ?? "—"}`}</p>
        <h2 className="text-base font-semibold break-words">{nomeDoContato(data.contato)}</h2>
        {data.descricao && <p className="text-sm text-neutral-600">{data.descricao}</p>}
        <p className="text-xs text-neutral-400">Criada em {dataHoraBR(data.createdAt)}</p>
        {cancelada && <p className="text-sm text-red-600 font-medium">Conta cancelada</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-neutral-200 px-3 py-2">
          <p className="text-[11px] text-neutral-500">Total da conta</p>
          <p className="text-lg font-semibold tabular-nums">{centsToBRL(data.totalCents)}</p>
        </div>
        <div className="rounded-md border border-neutral-200 px-3 py-2">
          <p className="text-[11px] text-neutral-500">Falta receber</p>
          <p className={`text-lg font-semibold tabular-nums ${data.saldoCents > 0 ? "text-amber-700" : "text-green-700"}`}>{centsToBRL(data.saldoCents)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={abrirConversa} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Abrir conversa
        </button>
        {podeReparcelar && (
          <button onClick={() => setReparcelando(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Reparcelar
          </button>
        )}
        {manual && !cancelada && (
          <button onClick={cancelarConta} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Cancelar conta
          </button>
        )}
      </div>

      {aviso && <p className="text-sm text-red-600">{aviso}</p>}

      <ul className="flex flex-col gap-3">
        {data.parcelas.map((p) => (
          <li key={p.id} className={`rounded-lg border p-3 ${p.id === focoParcelaId ? "border-accent" : "border-neutral-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {ROTULO_TIPO[p.tipo]} · {p.numero} de {p.totalParcelas}
                </p>
                <p className="text-xs text-neutral-500">
                  Vence {dataVencimento(p.vencimento)}
                  {p.pagaEm && <> · pago em {dataPagamento(p.pagaEm)}</>}
                </p>
                {p.observacao && <p className="text-xs text-neutral-500 mt-0.5">“{p.observacao}”</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">{centsToBRL(p.valorCents)}</p>
                <span className={`inline-block text-[10px] rounded-full px-2 py-0.5 mt-0.5 ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                {p.status === "PENDENTE" && p.pagoCents > 0 && (
                  <p className="text-[11px] text-neutral-500 tabular-nums">falta {centsToBRL(p.saldoCents)}</p>
                )}
              </div>
            </div>

            {p.pagamentos.length > 0 && (
              <ul className="mt-2 border-t border-neutral-100 pt-2 flex flex-col gap-1">
                {p.pagamentos.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 text-xs text-neutral-600">
                    <span className="min-w-0 truncate">
                      {dataPagamento(x.recebidoEm)} · {x.meio ? (ROTULO_MEIO[x.meio] ?? x.meio) : "—"}
                      {x.por && ` · ${x.por}`}
                      {x.observacao && ` · ${x.observacao}`}
                    </span>
                    <span className={`tabular-nums shrink-0 ${x.valorCents < 0 ? "text-red-600" : ""}`}>{centsToBRL(x.valorCents)}</span>
                  </li>
                ))}
              </ul>
            )}

            {!cancelada && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {p.status === "PENDENTE" && (
                  <button onClick={() => setRecebendo(p)} className="text-accent font-medium hover:underline">
                    Receber
                  </button>
                )}
                {(p.status === "PENDENTE" || p.status === "PAGA") && (
                  <button onClick={() => setEditando(p)} className="text-neutral-600 hover:text-accent">
                    Editar
                  </button>
                )}
                {p.pagoCents > 0 && p.status !== "REEMBOLSADA" && (
                  <button
                    onClick={() => acao(p.id, { acao: "estornar" }, "Estornar os recebimentos desta parcela? O valor volta a ser dívida.")}
                    className="text-neutral-600 hover:text-accent"
                  >
                    Estornar
                  </button>
                )}
                {manual && p.pagoCents > 0 && p.status !== "REEMBOLSADA" && (
                  <button
                    onClick={() => acao(p.id, { acao: "reembolsar" }, "Reembolsar esta parcela? O dinheiro foi devolvido ao cliente e a parcela é encerrada.")}
                    className="text-neutral-600 hover:text-accent"
                  >
                    Reembolsar
                  </button>
                )}
                {manual && p.status === "PENDENTE" && p.pagoCents === 0 && (
                  <button onClick={() => acao(p.id, { acao: "cancelar" }, "Cancelar esta parcela?")} className="text-red-600 hover:underline">
                    Cancelar parcela
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {recebendo && (
        <ReceberModal
          parcelaId={recebendo.id}
          titulo={`${ROTULO_TIPO[recebendo.tipo]} ${recebendo.numero} de ${recebendo.totalParcelas}`}
          saldoCents={recebendo.saldoCents}
          onFechar={() => setRecebendo(null)}
          onRecebido={() => {
            setRecebendo(null);
            recarregar();
          }}
        />
      )}
      {editando && (
        <EditarParcelaModal
          parcela={editando}
          podeMudarValor={manual}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            recarregar();
          }}
        />
      )}
      {reparcelando && (
        <ReparcelarModal
          contaId={contaId}
          totalRestanteCents={data.parcelas.filter((p) => p.status === "PENDENTE" && p.pagoCents === 0).reduce((s, p) => s + p.valorCents, 0)}
          onFechar={() => setReparcelando(false)}
          onSalvo={() => {
            setReparcelando(false);
            recarregar();
          }}
        />
      )}
    </Casca>
  );
}

function Casca({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <aside className="bg-surface w-full max-w-md h-full overflow-y-auto shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** Edita a parcela que aparece na lista pelo lápis: data, observação e, em conta avulsa, o valor. */
export function EditarParcelaModal({
  parcela,
  podeMudarValor,
  onFechar,
  onSalvo,
}: {
  parcela: { id: string; vencimento: string | null; valorCents: number; observacao: string | null; pagoCents: number };
  podeMudarValor: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [vencimento, setVencimento] = useState(parcela.vencimento ? parcela.vencimento.slice(0, 10) : "");
  const [valor, setValor] = useState((parcela.valorCents / 100).toFixed(2).replace(".", ","));
  const [observacao, setObservacao] = useState(parcela.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (podeMudarValor && (cents === null || cents <= 0)) return setErro("valor inválido");
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/parcelas/${parcela.id}`, "PATCH", {
      acao: "editar",
      vencimento: vencimento || null,
      observacao: observacao.trim() || null,
      ...(podeMudarValor && cents !== null && cents !== parcela.valorCents ? { valorCents: cents } : {}),
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra salvar");
    onSalvo();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-50";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">Editar parcela</h2>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Vencimento
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={`${campo} mt-1`} />
            <span className="block text-[11px] text-neutral-400 mt-1">Em branco = sem prazo combinado.</span>
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Valor (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} disabled={!podeMudarValor} inputMode="decimal" className={`${campo} mt-1`} />
            {!podeMudarValor && <span className="block text-[11px] text-neutral-400 mt-1">O valor das parcelas de um pedido muda ao reparcelar.</span>}
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Observação
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

function ReparcelarModal({
  contaId,
  totalRestanteCents,
  onFechar,
  onSalvo,
}: {
  contaId: string;
  totalRestanteCents: number;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [entrada, setEntrada] = useState("");
  const [numParcelas, setNumParcelas] = useState("2");
  const [periodicidade, setPeriodicidade] = useState<"SEMANAL" | "QUINZENAL" | "MENSAL">("SEMANAL");
  const [primeiro, setPrimeiro] = useState(hojeISO());
  const [vencEntrada, setVencEntrada] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const entradaCents = entrada.trim() ? reaisParaCentavos(entrada) : 0;
  const n = Number(numParcelas);

  const previa = useMemo(() => {
    if (entradaCents === null || !Number.isInteger(n) || n < 1) return { erro: null as string | null, linhas: [] };
    try {
      return {
        erro: null,
        linhas: gerarParcelas({
          totalCents: totalRestanteCents,
          entradaCents,
          numParcelas: n,
          periodicidade,
          primeiroVencimento: new Date(`${primeiro}T12:00:00Z`),
          vencimentoEntrada: new Date(`${vencEntrada}T12:00:00Z`),
        }),
      };
    } catch (e) {
      return { erro: (e as Error).message, linhas: [] };
    }
  }, [entradaCents, n, periodicidade, primeiro, vencEntrada, totalRestanteCents]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (previa.erro || entradaCents === null) return setErro(previa.erro ?? "entrada inválida");
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/contas-receber/${contaId}`, "PATCH", {
      acao: "reparcelar",
      entradaCents: entradaCents || undefined,
      vencimentoEntrada: entradaCents ? vencEntrada : undefined,
      numParcelas: n,
      periodicidade,
      primeiroVencimento: primeiro,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra reparcelar");
    onSalvo();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-md shadow-lg max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-1">Reparcelar</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Refaz as parcelas que ainda não tiveram recebimento: {centsToBRL(totalRestanteCents)} a dividir. As já pagas ficam como estão.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Entrada (R$, opcional)
            <input value={entrada} onChange={(e) => setEntrada(e.target.value)} inputMode="decimal" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Parcelas
            <input value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Periodicidade
            <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)} className={`${campo} mt-1`}>
              <option value="SEMANAL">Semanal</option>
              <option value="QUINZENAL">Quinzenal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-700">
            1º vencimento
            <input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {entradaCents ? (
            <label className="text-xs font-medium text-neutral-700">
              Vence a entrada
              <input type="date" value={vencEntrada} onChange={(e) => setVencEntrada(e.target.value)} className={`${campo} mt-1`} />
            </label>
          ) : null}
        </div>

        {previa.linhas.length > 0 && (
          <ul className="mt-4 rounded-md border border-neutral-200 divide-y divide-neutral-100 text-sm tabular-nums">
            {previa.linhas.map((p, i) => (
              <li key={i} className="flex justify-between px-3 py-1.5">
                <span>
                  {ROTULO_TIPO[p.tipo]} {p.numero} de {p.totalParcelas} · {dataVencimento(p.vencimento.toISOString())}
                </span>
                <span>{centsToBRL(p.valorCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {(previa.erro || erro) && <p className="text-sm text-red-600 mt-3">{previa.erro ?? erro}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Reparcelar
          </button>
        </div>
      </form>
    </div>
  );
}
