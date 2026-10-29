"use client";

import { useState } from "react";
import useSWR from "swr";
import { useTermoPedido } from "@/components/recursos-context";
import { OrderPanel, centsToBRL, type Pedido } from "@/components/order-panel";
import { ReciboConfig } from "@/components/recibo-config";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  if (!res.ok) throw new Error("não foi possível carregar");
  return res.json();
};

const ABAS = [
  { key: "AGUARDANDO_FINANCEIRO", label: "Aguardando" },
  { key: "FECHADO", label: "Fechados" },
  { key: "RASCUNHO", label: "Rascunhos" },
  { key: "CANCELADO", label: "Cancelados" },
] as const;

const FORMAS: Record<string, string> = {
  PIX: "PIX",
  PIX_PENDENTE: "PIX a pagar",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  FIADO: "Recorrente",
};

type Linha = Pedido & { recebidoCents: number; saldoCents: number };
type Resposta = {
  pedidos: Linha[];
  totais: { quantidade: number; mostrando: number; totalCents: number; recebidoCents: number; aReceberCents: number; qtdAReceber: number };
};

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

function condicao(p: Pedido): string | null {
  if (p.paymentMethod !== "FIADO" || !p.planoNumParcelas) return null;
  const per = { SEMANAL: "semanais", QUINZENAL: "quinzenais", MENSAL: "mensais", UNICA: "", ENTRADA: "" }[p.planoPeriodicidade ?? "UNICA"] ?? "";
  return `${p.planoEntradaCents ? `entrada ${centsToBRL(p.planoEntradaCents)} + ` : ""}${p.planoNumParcelas}x ${per}`.trim();
}

function Cartao({ titulo, valor, nota, destaque }: { titulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${destaque ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-surface"}`}>
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-500">{nota}</p>}
    </div>
  );
}

export function OrdersQueue({ ehFinanceiro }: { ehFinanceiro: boolean }) {
  const termo = useTermoPedido();
  const [aba, setAba] = useState<(typeof ABAS)[number]["key"]>("AGUARDANDO_FINANCEIRO");
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  // Busca e filtros (Believe, 23/10).
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [forma, setForma] = useState("");
  const [pagamento, setPagamento] = useState<"" | "pago" | "aberto">("");

  const params = new URLSearchParams({ formato: "lista", status: aba });
  if (busca.trim()) params.set("q", busca.trim());
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  if (forma) params.set("forma", forma);
  if (pagamento && aba === "FECHADO") params.set("pagamento", pagamento);

  const { data, error, mutate } = useSWR<Resposta>(`/api/orders?${params.toString()}`, fetcher, {
    // A fila é uma tela de espera: a consultora manda e o financeiro precisa
    // ver aparecer sem ficar recarregando.
    refreshInterval: 20_000,
    keepPreviousData: true,
  });
  const pedidos = data?.pedidos;
  const t = data?.totais;
  const filtrando = !!(busca.trim() || de || ate || forma || pagamento);
  const campo = "rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-xl font-semibold">{termo.plural}</h1>
        <button
          onClick={() => setConfigAberta(true)}
          className="text-sm rounded-md border border-neutral-300 px-3 py-1.5 hover:border-accent"
        >
          Dados do recibo
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        A consultora monta na conversa e envia. Aqui o financeiro coloca valor, condição e fecha — e é o
        fechamento que baixa o estoque.
      </p>

      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${
              aba === a.key
                ? "border-accent text-accent font-medium"
                : "border-transparent text-neutral-600 hover:text-neutral-800"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, telefone, nº ou produto"
          className={`${campo} flex-1 min-w-[220px]`}
        />
        <label className="text-xs text-neutral-500">
          {aba === "FECHADO" ? "Fechado de" : aba === "CANCELADO" ? "Cancelado de" : "Criado de"}
          <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        <label className="text-xs text-neutral-500">
          até
          <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className={`${campo} block mt-0.5`} />
        </label>
        {(aba === "FECHADO" || aba === "CANCELADO") && (
          <label className="text-xs text-neutral-500">
            Forma de pagamento
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={`${campo} block mt-0.5`}>
              <option value="">Todas</option>
              {Object.entries(FORMAS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        )}
        {aba === "FECHADO" && (
          <label className="text-xs text-neutral-500">
            Pagamento
            <select value={pagamento} onChange={(e) => setPagamento(e.target.value as typeof pagamento)} className={`${campo} block mt-0.5`}>
              <option value="">Todos</option>
              <option value="aberto">A receber</option>
              <option value="pago">Quitados</option>
            </select>
          </label>
        )}
        {filtrando && (
          <button
            onClick={() => {
              setBusca("");
              setDe("");
              setAte("");
              setForma("");
              setPagamento("");
            }}
            className="text-xs text-accent hover:underline pb-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Cartao titulo={termo.plural} valor={String(t.quantidade)} nota={t.quantidade > t.mostrando ? `mostrando os ${t.mostrando} mais recentes` : undefined} />
          <Cartao titulo="Total" valor={centsToBRL(t.totalCents)} />
          {aba === "FECHADO" && <Cartao titulo="Recebido" valor={centsToBRL(t.recebidoCents)} />}
          {aba === "FECHADO" && (
            <Cartao titulo="A receber" valor={centsToBRL(t.aReceberCents)} nota={`${t.qtdAReceber} ${termo.minusculo}(s) com saldo`} destaque={t.aReceberCents > 0} />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{String((error as Error).message)}</p>}
      {!data && !error && <p className="text-sm text-neutral-500">Carregando...</p>}
      {pedidos?.length === 0 && (
        <p className="text-sm text-neutral-500">
          {filtrando ? "Nada com esses filtros." : aba === "AGUARDANDO_FINANCEIRO" ? `Nenhum ${termo.minusculo} esperando.` : "Nada aqui."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {pedidos?.map((p) => {
          const cond = condicao(p);
          return (
            <div key={p.id} className="flex items-stretch gap-2">
              <button
                onClick={() => setAberto(p)}
                className="flex-1 min-w-0 text-left rounded-lg border border-neutral-200 bg-surface px-4 py-3 hover:border-accent"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium">
                    #{p.numero} · {p.contact.name ?? p.contact.phoneNumber ?? "Cliente"}
                  </span>
                  {p.status !== "FECHADO" && p.items.length === 0 ? (
                    <span className="text-xs text-neutral-400">sem itens</span>
                  ) : (
                    <span className="tabular-nums font-semibold">
                      {centsToBRL(p.status === "FECHADO" ? p.totalCents : p.items.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0))}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-1 items-center">
                  <span>{p.status === "FECHADO" ? `fechado em ${dataBR(p.fechadoEm)}` : p.status === "CANCELADO" ? `cancelado em ${dataBR(p.canceladoEm)}` : `criado em ${dataBR(p.createdAt)}`}</span>
                  <span>· {p.items.length} item(ns)</span>
                  {p.paymentMethod && <span>· {FORMAS[p.paymentMethod] ?? p.paymentMethod}</span>}
                  {cond && <span>· {cond}</span>}
                  {p.createdBy && <span>· {p.createdBy.name}</span>}
                  {p.conversation && <span>· ticket #{p.conversation.ticketNumber}</span>}
                  {p.status === "FECHADO" && p.saldoCents > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
                      a receber {centsToBRL(p.saldoCents)}
                      {p.recebidoCents > 0 && ` · recebido ${centsToBRL(p.recebidoCents)}`}
                    </span>
                  )}
                  {p.status === "FECHADO" && p.saldoCents === 0 && (
                    <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5">quitado</span>
                  )}
                  {p.status === "CANCELADO" && p.motivoCancelamento && <span>· {p.motivoCancelamento}</span>}
                </p>
              </button>
              {/* Fora do botão da linha: link dentro de botão é HTML inválido, e o
                  clique abriria o painel junto com a aba do recibo. */}
              {p.status === "FECHADO" && (
                <a
                  href={`/recibo/${p.id}`}
                  target="_blank"
                  rel="noopener"
                  title={`Imprimir recibo do ${termo.minusculo} #${p.numero}`}
                  className="shrink-0 grid place-items-center rounded-lg border border-neutral-200 bg-surface px-3 text-sm text-neutral-700 hover:border-accent hover:text-accent"
                >
                  Recibo
                </a>
              )}
            </div>
          );
        })}
      </div>

      {configAberta && <ReciboConfig onFechar={() => setConfigAberta(false)} />}

      {aberto && (
        <OrderPanel
          pedido={aberto}
          ehFinanceiro={ehFinanceiro}
          onFechar={() => {
            setAberto(null);
            mutate();
          }}
          onMudou={mutate}
        />
      )}
    </div>
  );
}
