"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { centsToBRL } from "@/lib/billing";

/**
 * Contas a receber.
 *
 * O que um ERP também faz é dizer quem deve. O que ele não faz é falar com a
 * pessoa — e é por isso que esta tela leva direto pra conversa: a dívida e o
 * histórico do cliente no mesmo lugar, sem copiar número pra outro sistema.
 */

type Faixa = "vencido" | "vence_hoje" | "a_vencer" | "sem_prazo";

type Item = {
  id: string;
  numero: number;
  contato: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
  conversationId: string | null;
  totalCents: number;
  saldoCents: number;
  parcial: boolean;
  vencimento: string | null;
  faixa: Faixa;
  diasAtraso: number;
  paymentMethod: string | null;
};

type Resposta = {
  itens: Item[];
  resumo: Record<Faixa | "total", number>;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Faixa carrega SEMPRE o rótulo escrito junto da cor. Vermelho sozinho não
// diz "vencido" pra quem não distingue vermelho de cinza.
const FAIXA: Record<Faixa, { rotulo: string; classe: string }> = {
  vencido: { rotulo: "Vencido", classe: "bg-red-50 text-red-700 border-red-200" },
  vence_hoje: { rotulo: "Vence hoje", classe: "bg-amber-50 text-amber-800 border-amber-200" },
  a_vencer: { rotulo: "A vencer", classe: "bg-neutral-100 text-neutral-600 border-neutral-200" },
  sem_prazo: { rotulo: "Sem prazo", classe: "bg-neutral-100 text-neutral-500 border-neutral-200" },
};

const ORDEM_FAIXAS: Faixa[] = ["vencido", "vence_hoje", "a_vencer", "sem_prazo"];

function dataCurta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function ReceivablesPanel({ podeReceber }: { podeReceber: boolean }) {
  const { data, mutate } = useSWR<Resposta>("/api/receivables", fetcher);
  const [recebendo, setRecebendo] = useState<Item | null>(null);

  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;
  if ("error" in data) return <p className="text-sm text-red-600">{String(data.error)}</p>;

  const { itens, resumo } = data;

  if (itens.length === 0) {
    return (
      <div className="max-w-4xl">
        <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-10 text-center text-sm text-neutral-400">
          Nada a receber. Pedido fechado como fiado ou boleto aparece aqui até ser quitado.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ORDEM_FAIXAS.map((f) => (
          <div
            key={f}
            className={`rounded-lg border px-3 py-2.5 ${
              resumo[f] > 0 ? FAIXA[f].classe : "border-neutral-200 bg-surface text-neutral-400"
            }`}
          >
            <p className="text-xs">{FAIXA[f].rotulo}</p>
            <p className="text-lg font-semibold tabular-nums">{centsToBRL(resumo[f])}</p>
          </div>
        ))}
      </div>

      <p className="mb-4 text-sm text-neutral-600">
        Total a receber: <b className="tabular-nums">{centsToBRL(resumo.total)}</b> em{" "}
        {itens.length} pedido(s).
      </p>

      <div className="flex flex-col gap-2">
        {itens.map((i) => {
          const faixa = FAIXA[i.faixa];
          const nome = i.contato.name ?? i.contato.phoneNumber ?? "Sem nome";
          return (
            <div key={i.id} className="rounded-lg border border-neutral-200 bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900">{nome}</span>
                    <span className="font-mono text-xs text-neutral-400">#{i.numero}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${faixa.classe}`}>
                      {faixa.rotulo}
                      {i.faixa === "vencido" && ` há ${i.diasAtraso} dia(s)`}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-600">
                    <span className="tabular-nums font-medium text-neutral-900">
                      {centsToBRL(i.saldoCents)}
                    </span>
                    {/* Parcial muda a conversa da cobrança: quem já pagou
                        metade não recebe a mesma mensagem de quem não pagou
                        nada. */}
                    {i.parcial && (
                      <span className="ml-1.5 text-neutral-500">
                        de {centsToBRL(i.totalCents)} — pagamento parcial
                      </span>
                    )}
                    {i.vencimento && (
                      <span className="ml-1.5 text-neutral-500">
                        · venceu {dataCurta(i.vencimento)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {i.conversationId && (
                    <Link
                      href={`/inbox?open=${i.conversationId}`}
                      className="text-accent hover:underline"
                    >
                      Abrir conversa
                    </Link>
                  )}
                  {podeReceber && (
                    <button onClick={() => setRecebendo(i)} className="text-accent hover:underline">
                      Registrar recebimento
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {recebendo && (
        <FormRecebimento
          item={recebendo}
          onFechar={() => setRecebendo(null)}
          onSalvo={() => {
            setRecebendo(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function FormRecebimento({
  item,
  onFechar,
  onSalvo,
}: {
  item: Item;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  // Começa com o saldo inteiro: quitar é o caso comum, e digitar o valor de
  // novo é atrito em cima do que já se sabe.
  const [valor, setValor] = useState((item.saldoCents / 100).toFixed(2).replace(".", ","));
  const [meio, setMeio] = useState("PIX");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const centavos = Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(centavos) || centavos === 0) {
      setErro("valor inválido");
      return;
    }

    setSalvando(true);
    const res = await fetch(`/api/orders/${item.id}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorCents: centavos, meio, observacao }),
    });
    setSalvando(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra registrar");
      return;
    }
    onSalvo();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onFechar}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-surface p-6"
      >
        <h2 className="mb-1 text-lg font-semibold">Registrar recebimento</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Pedido #{item.numero} · saldo {centsToBRL(item.saldoCents)}
        </p>

        <label className="mb-3 block text-sm">
          <span className="text-neutral-700">Valor recebido</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            required
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 tabular-nums"
          />
          <span className="text-xs text-neutral-500">
            Pode ser parcial. Para estornar, use valor negativo.
          </span>
        </label>

        <label className="mb-3 block text-sm">
          <span className="text-neutral-700">Como recebeu</span>
          <select
            value={meio}
            onChange={(e) => setMeio(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          >
            <option value="PIX">PIX</option>
            <option value="CARTAO">Cartão</option>
            <option value="BOLETO">Boleto</option>
            <option value="FIADO">Outro</option>
          </select>
        </label>

        <label className="mb-4 block text-sm">
          <span className="text-neutral-700">Observação</span>
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={300}
            placeholder="opcional"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        {erro && <p className="mb-3 text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-3 text-sm">
          <button type="button" onClick={onFechar} className="px-4 py-2 text-neutral-600">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
