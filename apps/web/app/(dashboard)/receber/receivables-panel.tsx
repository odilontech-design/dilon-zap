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
  precisaAtencaoHoje: boolean;
};

type Recebimento = {
  id: string;
  valorCents: number;
  recebidoEm: string;
  meio: string | null;
  observacao: string | null;
  numero: number;
  orderId: string;
  totalCents: number;
  quitado: boolean;
  conversationId: string | null;
  contato: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
};

type Resposta = {
  itens: Item[];
  resumo: Record<Faixa | "total", number>;
  historico: Recebimento[];
  recebidoNoMesCents: number;
  meses: number;
};

const MEIO_LABEL: Record<string, string> = {
  PIX: "PIX",
  PIX_PENDENTE: "PIX",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  FIADO: "Outro",
};

const PERIODOS = [
  { meses: 1, rotulo: "1 mês" },
  { meses: 3, rotulo: "3 meses" },
  { meses: 6, rotulo: "6 meses" },
  { meses: 12, rotulo: "12 meses" },
];

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

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceivablesPanel({ podeReceber }: { podeReceber: boolean }) {
  const [aba, setAba] = useState<"aberto" | "historico">("aberto");
  const [meses, setMeses] = useState(3);
  const { data, mutate } = useSWR<Resposta>(`/api/receivables?meses=${meses}`, fetcher);
  const [recebendo, setRecebendo] = useState<Item | null>(null);

  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;
  if ("error" in data) return <p className="text-sm text-red-600">{String(data.error)}</p>;

  const { itens, resumo, historico, recebidoNoMesCents } = data;
  const totalDoPeriodo = historico.reduce((s, h) => s + h.valorCents, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-accent">
          <p className="text-xs">Recebido no mês</p>
          <p className="text-lg font-semibold tabular-nums">{centsToBRL(recebidoNoMesCents)}</p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            resumo.total > 0
              ? "border-neutral-300 bg-surface text-neutral-800"
              : "border-neutral-200 bg-surface text-neutral-400"
          }`}
        >
          <p className="text-xs">Em aberto</p>
          <p className="text-lg font-semibold tabular-nums">{centsToBRL(resumo.total)}</p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            resumo.vencido > 0 ? FAIXA.vencido.classe : "border-neutral-200 bg-surface text-neutral-400"
          }`}
        >
          <p className="text-xs">Vencido</p>
          <p className="text-lg font-semibold tabular-nums">{centsToBRL(resumo.vencido)}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-neutral-200 text-sm">
        {([
          ["aberto", `Em aberto${itens.length ? ` (${itens.length})` : ""}`],
          ["historico", "Histórico"],
        ] as const).map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`-mb-px border-b-2 px-3 py-2 ${
              aba === chave
                ? "border-accent font-medium text-accent"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "historico" ? (
        <HistoricoRecebido
          historico={historico}
          totalCents={totalDoPeriodo}
          meses={meses}
          setMeses={setMeses}
        />
      ) : itens.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-10 text-center text-sm text-neutral-400">
          Nada a receber. Pedido fechado como fiado, boleto ou PIX a pagar aparece aqui até ser
          quitado.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <ListaEmAberto itens={itens} podeReceber={podeReceber} onReceber={setRecebendo} />
        </>
      )}

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

/**
 * O que já entrou, do mais recente pro mais antigo.
 *
 * A lista de A receber some com o pedido assim que ele é quitado — e some
 * junto a prova de que foi pago. Aqui o pagamento continua visível depois de
 * quitado, que é o que a Guttierres pediu pra conferir honorário recebido.
 */
function HistoricoRecebido({
  historico,
  totalCents,
  meses,
  setMeses,
}: {
  historico: Recebimento[];
  totalCents: number;
  meses: number;
  setMeses: (m: number) => void;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 text-xs">
          {PERIODOS.map((p) => (
            <button
              key={p.meses}
              onClick={() => setMeses(p.meses)}
              className={`rounded-md border px-2.5 py-1 ${
                meses === p.meses
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <p className="text-sm text-neutral-600">
          Recebido no período: <b className="tabular-nums">{centsToBRL(totalCents)}</b>
        </p>
      </div>

      {historico.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-10 text-center text-sm text-neutral-400">
          Nenhum recebimento registrado nesse período.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {historico.map((h) => {
            const nome = h.contato.name ?? h.contato.phoneNumber ?? "Sem nome";
            const estorno = h.valorCents < 0;
            return (
              <div key={h.id} className="rounded-lg border border-neutral-200 bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900">{nome}</span>
                      <span className="font-mono text-xs text-neutral-400">#{h.numero}</span>
                      {estorno ? (
                        <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                          Estorno
                        </span>
                      ) : (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] ${
                            h.quitado
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {h.quitado ? "Quitado" : "Parcial"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600">
                      <span
                        className={`font-medium tabular-nums ${
                          estorno ? "text-red-700" : "text-neutral-900"
                        }`}
                      >
                        {centsToBRL(h.valorCents)}
                      </span>
                      {!h.quitado && !estorno && (
                        <span className="ml-1.5 text-neutral-500">
                          de {centsToBRL(h.totalCents)}
                        </span>
                      )}
                      <span className="ml-1.5 text-neutral-500">· {dataHora(h.recebidoEm)}</span>
                      {h.meio && (
                        <span className="ml-1.5 text-neutral-500">
                          · {MEIO_LABEL[h.meio] ?? h.meio}
                        </span>
                      )}
                    </p>
                    {h.observacao && (
                      <p className="mt-0.5 text-xs text-neutral-500">{h.observacao}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    {h.conversationId && (
                      <Link
                        href={`/inbox?open=${h.conversationId}`}
                        className="text-accent hover:underline"
                      >
                        Abrir conversa
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ListaEmAberto({
  itens,
  podeReceber,
  onReceber,
}: {
  itens: Item[];
  podeReceber: boolean;
  onReceber: (i: Item) => void;
}) {
  return (
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
                    {/* Mesmo critério que dispara o push pro financeiro (ver
                        receivables-followup.ts) — quem está com a tela
                        aberta enxerga sem depender da notificação. */}
                    {i.precisaAtencaoHoje && (
                      <span
                        title="Hoje é dia de dar atenção a este pedido"
                        className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent"
                      >
                        ⏰ Hoje
                      </span>
                    )}
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
                    <button onClick={() => onReceber(i)} className="text-accent hover:underline">
                      Registrar recebimento
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
