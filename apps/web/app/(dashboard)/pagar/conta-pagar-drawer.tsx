"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { chamar, dataHoraBR, dataPagamento, dataVencimento, fetcher, ROTULO_STATUS, type StatusParcela } from "../receber/formatos";
import { EditarParcelaPagarModal, PagarModal, ReparcelarPagarModal, ROTULO_FORMA, type FormaPagar } from "./pagar-modais";

type SaidaDetalhe = { id: string; valorCents: number; meio: string | null; pagoEm: string; observacao: string | null; por: string | null };

type ParcelaDetalhe = {
  id: string;
  numero: number;
  totalParcelas: number;
  forma: FormaPagar;
  vencimento: string | null;
  valorCents: number;
  status: StatusParcela;
  pagoCents: number;
  saldoCents: number;
  pagoEm: string | null;
  observacao: string | null;
  pagamentos: SaidaDetalhe[];
};

type Detalhe = {
  id: string;
  descricao: string | null;
  canceladaEm: string | null;
  createdAt: string;
  fornecedor: { id: string; nome: string; telefone: string | null };
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

export function ContaPagarDrawer({ contaId, focoParcelaId, onFechar, onMudou }: { contaId: string; focoParcelaId?: string | null; onFechar: () => void; onMudou: () => void }) {
  const { data, error, mutate } = useSWR<Detalhe>(`/api/contas-pagar/${contaId}`, fetcher);
  const [pagando, setPagando] = useState<ParcelaDetalhe | null>(null);
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
    const r = await chamar(`/api/parcelas-pagar/${parcelaId}`, "PATCH", corpo);
    if (!r.ok) return setAviso(r.erro ?? "não deu pra concluir");
    recarregar();
  }

  async function cancelarConta() {
    if (!confirm("Cancelar esta conta inteira? As parcelas deixam de contar como a pagar.")) return;
    setAviso(null);
    const r = await chamar(`/api/contas-pagar/${contaId}`, "PATCH", { acao: "cancelar" });
    if (!r.ok) return setAviso(r.erro ?? "não deu pra cancelar");
    onMudou();
    onFechar();
  }

  const casca = (conteudo: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <aside className="bg-surface w-full max-w-md h-full overflow-y-auto shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {conteudo}
      </aside>
    </div>
  );

  if (error) return casca(<p className="text-sm text-red-600">{error.message}</p>);
  if (!data) return casca(<p className="text-sm text-neutral-400">Carregando...</p>);

  const cancelada = !!data.canceladaEm;
  const podeReparcelar = !cancelada && data.parcelas.some((p) => p.status === "PENDENTE" && p.pagoCents === 0);

  return casca(
    <>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-neutral-500">Conta a pagar</p>
        <h2 className="text-base font-semibold break-words">{data.fornecedor.nome}</h2>
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
          <p className="text-[11px] text-neutral-500">Falta pagar</p>
          <p className={`text-lg font-semibold tabular-nums ${data.saldoCents > 0 ? "text-amber-700" : "text-green-700"}`}>{centsToBRL(data.saldoCents)}</p>
        </div>
      </div>

      {!cancelada && (
        <div className="flex flex-wrap gap-2">
          {podeReparcelar && (
            <button onClick={() => setReparcelando(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Reparcelar
            </button>
          )}
          <button onClick={cancelarConta} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Cancelar conta
          </button>
        </div>
      )}
      {aviso && <p className="text-sm text-red-600">{aviso}</p>}

      <ul className="flex flex-col gap-3">
        {data.parcelas.map((p) => (
          <li key={p.id} className={`rounded-lg border p-3 ${p.id === focoParcelaId ? "border-accent" : "border-neutral-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Parcela {p.numero} de {p.totalParcelas} · {ROTULO_FORMA[p.forma]}
                </p>
                <p className="text-xs text-neutral-500">
                  Vence {dataVencimento(p.vencimento)}
                  {p.pagoEm && <> · pago em {dataPagamento(p.pagoEm)}</>}
                </p>
                {p.observacao && <p className="text-xs text-neutral-500 mt-0.5">“{p.observacao}”</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">{centsToBRL(p.valorCents)}</p>
                <span className={`inline-block text-[10px] rounded-full px-2 py-0.5 mt-0.5 ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                {p.status === "PENDENTE" && p.pagoCents > 0 && <p className="text-[11px] text-neutral-500 tabular-nums">falta {centsToBRL(p.saldoCents)}</p>}
              </div>
            </div>

            {p.pagamentos.length > 0 && (
              <ul className="mt-2 border-t border-neutral-100 pt-2 flex flex-col gap-1">
                {p.pagamentos.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 text-xs text-neutral-600">
                    <span className="min-w-0 truncate">
                      {dataPagamento(x.pagoEm)} · {x.meio ? (ROTULO_FORMA[x.meio as FormaPagar] ?? x.meio) : "—"}
                      {x.por && ` · ${x.por}`}
                      {x.observacao && ` · ${x.observacao}`}
                    </span>
                    <span className={`tabular-nums shrink-0 ${x.valorCents < 0 ? "text-green-700" : ""}`}>{centsToBRL(x.valorCents)}</span>
                  </li>
                ))}
              </ul>
            )}

            {!cancelada && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {p.status === "PENDENTE" && (
                  <button onClick={() => setPagando(p)} className="text-accent font-medium hover:underline">
                    Pagar
                  </button>
                )}
                {(p.status === "PENDENTE" || p.status === "PAGA") && (
                  <button onClick={() => setEditando(p)} className="text-neutral-600 hover:text-accent">
                    Editar
                  </button>
                )}
                {p.pagoCents > 0 && p.status !== "REEMBOLSADA" && (
                  <>
                    <button onClick={() => acao(p.id, { acao: "estornar" }, "Estornar os pagamentos desta parcela? O valor volta a ser dívida.")} className="text-neutral-600 hover:text-accent">
                      Estornar
                    </button>
                    <button onClick={() => acao(p.id, { acao: "reembolsar" }, "O fornecedor devolveu o dinheiro desta parcela? Ela será encerrada como reembolso.")} className="text-neutral-600 hover:text-accent">
                      Reembolsar
                    </button>
                  </>
                )}
                {p.status === "PENDENTE" && p.pagoCents === 0 && (
                  <button onClick={() => acao(p.id, { acao: "cancelar" }, "Cancelar esta parcela?")} className="text-red-600 hover:underline">
                    Cancelar parcela
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {pagando && (
        <PagarModal
          parcelaId={pagando.id}
          titulo={`Parcela ${pagando.numero} de ${pagando.totalParcelas}`}
          saldoCents={pagando.saldoCents}
          formaPrevista={pagando.forma}
          onFechar={() => setPagando(null)}
          onPago={() => {
            setPagando(null);
            recarregar();
          }}
        />
      )}
      {editando && (
        <EditarParcelaPagarModal
          parcela={{ id: editando.id, vencimento: editando.vencimento, valorCents: editando.valorCents, forma: editando.forma, observacao: editando.observacao }}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            recarregar();
          }}
        />
      )}
      {reparcelando && (
        <ReparcelarPagarModal
          contaId={contaId}
          totalRestanteCents={data.parcelas.filter((p) => p.status === "PENDENTE" && p.pagoCents === 0).reduce((s, p) => s + p.valorCents, 0)}
          onFechar={() => setReparcelando(false)}
          onSalvo={() => {
            setReparcelando(false);
            recarregar();
          }}
        />
      )}
    </>
  );
}
