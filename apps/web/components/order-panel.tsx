"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

/**
 * Painel do pedido — o mesmo dos dois lados.
 *
 * A consultora abre pela conversa e monta os itens; o financeiro abre pela
 * fila e fecha. É a MESMA tela porque é o mesmo pedido: duas telas
 * diferentes divergiriam, e o financeiro precisa ver exatamente o que foi
 * combinado, não uma versão resumida.
 *
 * O que muda por papel e por status é o que fica editável, não o layout.
 */

export type PedidoItem = {
  id?: string;
  productId: string | null;
  nomeProduto: string;
  precoTabelaCents: number;
  precoUnitCents: number;
  quantidade: number;
};

export type Pedido = {
  id: string;
  numero: number;
  status: "RASCUNHO" | "AGUARDANDO_FINANCEIRO" | "FECHADO" | "CANCELADO";
  paymentMethod: "PIX" | "CARTAO" | "BOLETO" | "FIADO" | null;
  pago: boolean;
  subtotalCents: number;
  descontoCents: number;
  totalCents: number;
  observacao: string | null;
  createdAt: string;
  fechadoEm: string | null;
  createdBy: { name: string } | null;
  closedBy: { name: string } | null;
  contact: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
  conversation: { id: string; ticketNumber: number } | null;
  items: PedidoItem[];
};

type Produto = { id: string; name: string; priceCents: number; stockQty: number; isActive: boolean };

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  if (!res.ok) throw new Error("não foi possível carregar");
  return res.json();
};

export function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseValor(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return 0;
  const temV = limpo.includes(",");
  const temP = limpo.includes(".");
  let n: string;
  if (temV && temP) n = limpo.replace(/\./g, "").replace(",", ".");
  else if (temV) n = limpo.replace(",", ".");
  else if (temP) n = (limpo.split(".").pop() ?? "").length === 3 ? limpo.replace(/\./g, "") : limpo;
  else n = limpo;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

const STATUS_LABEL: Record<Pedido["status"], string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_FINANCEIRO: "Aguardando financeiro",
  FECHADO: "Fechado",
  CANCELADO: "Cancelado",
};

const PAGAMENTO_LABEL: Record<NonNullable<Pedido["paymentMethod"]>, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  FIADO: "Fiado",
};

export function OrderPanel({
  pedido,
  ehFinanceiro,
  onFechar,
  onMudou,
}: {
  pedido: Pedido;
  ehFinanceiro: boolean;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const { data: produtos } = useSWR<Produto[]>("/api/products", fetcher);
  const [itens, setItens] = useState<PedidoItem[]>(pedido.items);
  const [observacao, setObservacao] = useState(pedido.observacao ?? "");
  const [desconto, setDesconto] = useState((pedido.descontoCents / 100).toFixed(2).replace(".", ","));
  const [pagamento, setPagamento] = useState<NonNullable<Pedido["paymentMethod"]>>(
    pedido.paymentMethod ?? "PIX"
  );
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const editavel = pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_FINANCEIRO";
  const podeFechar = ehFinanceiro && pedido.status === "AGUARDANDO_FINANCEIRO";

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0),
    [itens]
  );
  const descontoCents = parseValor(desconto) ?? 0;
  const total = Math.max(subtotal - Math.min(descontoCents, subtotal), 0);

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return (produtos ?? []).filter((p) => p.isActive && p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [produtos, busca]);

  function adicionar(p: Produto) {
    setBusca("");
    setItens((atual) => {
      // Mesmo produto duas vezes vira quantidade, não linha duplicada — é o
      // que a atendente espera ao clicar de novo, e evita pedido com o mesmo
      // item em três linhas por preços diferentes.
      const i = atual.findIndex((x) => x.productId === p.id);
      if (i >= 0) {
        const copia = [...atual];
        copia[i] = { ...copia[i], quantidade: copia[i].quantidade + 1 };
        return copia;
      }
      return [
        ...atual,
        {
          productId: p.id,
          nomeProduto: p.name,
          precoTabelaCents: p.priceCents,
          precoUnitCents: p.priceCents,
          quantidade: 1,
        },
      ];
    });
  }

  async function acao(corpo: Record<string, unknown>) {
    setErro(null);
    setOcupado(true);
    const res = await fetch(`/api/orders/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setOcupado(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof b.error === "string" ? b.error : "não deu pra concluir");
      return null;
    }
    onMudou();
    return b;
  }

  async function salvarItens() {
    return acao({ acao: "salvarItens", itens, observacao });
  }

  async function enviar() {
    if ((await salvarItens()) === null) return;
    if ((await acao({ acao: "enviarAoFinanceiro" })) !== null) onFechar();
  }

  async function fechar() {
    if ((await salvarItens()) === null) return;
    const r = await acao({
      acao: "fechar",
      paymentMethod: pagamento,
      descontoCents,
      observacao,
    });
    if (r === null) return;
    if (r.jaEstavaFechado) setErro("Esse pedido já tinha sido fechado — nada foi baixado de novo.");
    else onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-2xl max-h-[92vh] flex flex-col"
      >
        <header className="p-5 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              Pedido #{pedido.numero}
              <span className="ml-2 text-xs font-normal rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5">
                {STATUS_LABEL[pedido.status]}
              </span>
              {pedido.status === "FECHADO" && !pedido.pago && (
                <span className="ml-1 text-xs font-normal rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
                  a receber
                </span>
              )}
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              {pedido.contact.name ?? pedido.contact.phoneNumber ?? "Cliente"}
              {pedido.createdBy && ` · aberto por ${pedido.createdBy.name}`}
              {pedido.closedBy && ` · fechado por ${pedido.closedBy.name}`}
            </p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {erro && (
            <p className="rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{erro}</p>
          )}

          {editavel && (
            <div className="relative">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto para adicionar..."
                className="w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
              />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-neutral-200 bg-surface shadow-lg">
                  {sugestoes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => adicionar(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 flex justify-between gap-3"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-neutral-500 tabular-nums">
                        {centsToBRL(p.priceCents)}
                        {/* Avisa mas deixa vender, conforme decidido. */}
                        {p.stockQty <= 0 && <span className="ml-2 text-red-600">sem estoque</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {itens.length === 0 && <p className="text-sm text-neutral-500">Nenhum item ainda.</p>}

          {itens.map((item, idx) => {
            const comDesconto = item.precoUnitCents < item.precoTabelaCents;
            return (
              <div key={idx} className="flex items-center gap-2 text-sm border-b border-neutral-200 pb-2">
                <span className="flex-1 min-w-0 truncate">{item.nomeProduto}</span>

                <input
                  value={item.quantidade}
                  disabled={!editavel}
                  onChange={(e) => {
                    const q = parseInt(e.target.value, 10);
                    setItens((a) =>
                      a.map((x, i) => (i === idx ? { ...x, quantidade: Number.isFinite(q) && q > 0 ? q : 1 } : x))
                    );
                  }}
                  inputMode="numeric"
                  className="w-14 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-center tabular-nums disabled:opacity-60"
                />

                <div className="w-28">
                  <input
                    value={(item.precoUnitCents / 100).toFixed(2).replace(".", ",")}
                    // Alterar preço é do financeiro. A consultora monta com o
                    // preço de tabela; quem negocia valor é quem fecha.
                    disabled={!editavel || !ehFinanceiro}
                    onChange={(e) => {
                      const v = parseValor(e.target.value);
                      if (v === null) return;
                      setItens((a) => a.map((x, i) => (i === idx ? { ...x, precoUnitCents: v } : x)));
                    }}
                    inputMode="decimal"
                    className="w-full rounded-md border border-neutral-300 bg-surface px-2 py-1 text-right tabular-nums disabled:opacity-60"
                  />
                  {comDesconto && (
                    <p className="text-[10px] text-neutral-400 text-right line-through tabular-nums">
                      {centsToBRL(item.precoTabelaCents)}
                    </p>
                  )}
                </div>

                <span className="w-24 text-right tabular-nums font-medium">
                  {centsToBRL(item.precoUnitCents * item.quantidade)}
                </span>

                {editavel && (
                  <button
                    onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}
                    className="text-red-600 hover:text-red-700 px-1"
                    aria-label="Remover item"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-1.5 text-sm border-t border-neutral-200 pt-3">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{centsToBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-neutral-600">
              <span>Desconto</span>
              <input
                value={desconto}
                disabled={!podeFechar}
                onChange={(e) => setDesconto(e.target.value)}
                inputMode="decimal"
                className="w-28 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-right tabular-nums disabled:opacity-60"
              />
            </div>
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{centsToBRL(total)}</span>
            </div>
          </div>

          <label className="text-sm">
            <span className="text-xs font-medium text-neutral-700">Observação</span>
            <textarea
              value={observacao}
              disabled={!editavel}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Entrega, prazo, combinado com a cliente..."
              className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y disabled:opacity-60"
            />
          </label>

          {podeFechar && (
            <label className="text-sm">
              <span className="text-xs font-medium text-neutral-700">Forma de pagamento</span>
              <select
                value={pagamento}
                onChange={(e) => setPagamento(e.target.value as typeof pagamento)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
              >
                <option value="PIX">PIX — já pago</option>
                <option value="CARTAO">Cartão na maquininha — já pago</option>
                <option value="BOLETO">Boleto — a receber</option>
                <option value="FIADO">Fiado — a receber</option>
              </select>
            </label>
          )}

          {pedido.status === "FECHADO" && (
            <p className="text-sm text-neutral-600">
              Fechado em {new Date(pedido.fechadoEm!).toLocaleString("pt-BR")} ·{" "}
              {pedido.paymentMethod && PAGAMENTO_LABEL[pedido.paymentMethod]} ·{" "}
              {pedido.pago ? "pago" : "a receber"}
            </p>
          )}
        </div>

        <footer className="p-4 border-t border-neutral-200 flex justify-end gap-2 text-sm flex-wrap">
          {pedido.status === "FECHADO" && !pedido.pago && ehFinanceiro && (
            <button
              onClick={() => acao({ acao: "marcarPago" }).then((r) => r && onFechar())}
              disabled={ocupado}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
            >
              Marcar como pago
            </button>
          )}

          {editavel && ehFinanceiro && (
            <button
              onClick={() => acao({ acao: "cancelar" }).then((r) => r && onFechar())}
              disabled={ocupado}
              className="px-3 py-2 text-red-600 hover:underline disabled:opacity-50"
            >
              Cancelar pedido
            </button>
          )}

          {editavel && (
            <button
              onClick={() => salvarItens().then((r) => r && onFechar())}
              disabled={ocupado}
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              Salvar
            </button>
          )}

          {pedido.status === "RASCUNHO" && (
            <button
              onClick={enviar}
              disabled={ocupado || itens.length === 0}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-40"
            >
              Enviar ao financeiro
            </button>
          )}

          {podeFechar && (
            <button
              onClick={fechar}
              disabled={ocupado || itens.length === 0}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-40"
            >
              Fechar pedido
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
