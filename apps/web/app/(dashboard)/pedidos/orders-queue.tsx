"use client";

import { useState } from "react";
import useSWR from "swr";
import { OrderPanel, centsToBRL, type Pedido } from "@/components/order-panel";

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
] as const;

export function OrdersQueue({ ehFinanceiro }: { ehFinanceiro: boolean }) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["key"]>("AGUARDANDO_FINANCEIRO");
  const [aberto, setAberto] = useState<Pedido | null>(null);

  const { data: pedidos, mutate } = useSWR<Pedido[]>(`/api/orders?status=${aba}`, fetcher, {
    // A fila é uma tela de espera: a consultora manda e o financeiro precisa
    // ver aparecer sem ficar recarregando.
    refreshInterval: 20_000,
  });

  const aReceber = (pedidos ?? []).filter((p) => p.status === "FECHADO" && !p.pago);

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold mb-1">Pedidos</h1>
      <p className="text-sm text-neutral-500 mb-4">
        A consultora monta na conversa e envia. Aqui o financeiro coloca valor, condição e fecha — e é o
        fechamento que baixa o estoque.
      </p>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              aba === a.key
                ? "border-accent text-accent font-medium"
                : "border-transparent text-neutral-600 hover:text-neutral-800"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "FECHADO" && aReceber.length > 0 && (
        <p className="mb-4 rounded-md bg-amber-100 text-amber-900 px-3 py-2 text-sm">
          {aReceber.length} pedido(s) fechado(s) ainda a receber, somando{" "}
          <strong className="tabular-nums">
            {centsToBRL(aReceber.reduce((s, p) => s + p.totalCents, 0))}
          </strong>
          .
        </p>
      )}

      {!pedidos && <p className="text-sm text-neutral-500">Carregando...</p>}
      {pedidos?.length === 0 && (
        <p className="text-sm text-neutral-500">
          {aba === "AGUARDANDO_FINANCEIRO" ? "Nenhum pedido esperando." : "Nada aqui."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {pedidos?.map((p) => (
          <button
            key={p.id}
            onClick={() => setAberto(p)}
            className="text-left rounded-lg border border-neutral-200 bg-surface px-4 py-3 hover:border-accent"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium">
                #{p.numero} · {p.contact.name ?? p.contact.phoneNumber ?? "Cliente"}
              </span>
              <span className="tabular-nums font-semibold">
                {centsToBRL(p.status === "FECHADO" ? p.totalCents : p.items.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0))}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {p.items.length} item(ns)
              {p.createdBy && ` · ${p.createdBy.name}`}
              {p.conversation && ` · ticket #${p.conversation.ticketNumber}`}
              {p.status === "FECHADO" && !p.pago && (
                <span className="ml-2 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">a receber</span>
              )}
            </p>
          </button>
        ))}
      </div>

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
