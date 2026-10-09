"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRecurso } from "@/components/recursos-context";
import { centsToBRL } from "@/lib/billing";
import { fetcher, reaisParaCentavos } from "./tipos";

type Item = {
  // Chave só da tela, para a lista não perder o foco ao digitar.
  chave: string;
  productId: string | null;
  nomeProduto: string;
  precoTabelaCents: number;
  precoUnitCents: number;
  quantidade: number;
  cobranca: "UNICA" | "MENSAL";
};

type Produto = { id: string; name: string; priceCents: number; tipo: "PRODUTO" | "SERVICO"; cobranca?: "UNICA" | "MENSAL"; categoria: string | null };
type ItemSalvo = Omit<Item, "chave"> & { id: string };
type Pedido = { id: string; numero: number; status: string; totalCents: number; pago: boolean };

const STATUS_PEDIDO: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_FINANCEIRO: "Aguardando financeiro",
  FECHADO: "Fechado",
  CANCELADO: "Cancelado",
};

let seq = 0;
const novaChave = () => `i${++seq}`;
const emReais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * Itens da negociação: o que está sendo vendido, tirado do catálogo de
 * Produtos e Serviços. Com itens, o valor da negociação é a soma deles e a
 * parte mensal alimenta o MRR. Ganhando, "Gerar pedido" leva os mesmos itens
 * para Pedidos.
 */
export function ItensNegociacao({
  negociacaoId,
  editavel,
  pedidos,
  onMudou,
}: {
  negociacaoId: string;
  editavel: boolean;
  pedidos: Pedido[];
  onMudou: () => void;
}) {
  const temPedidos = useRecurso("PEDIDOS");
  const { data: salvos, mutate } = useSWR<ItemSalvo[]>(`/api/negociacoes/${negociacaoId}/itens`, fetcher);
  // Empresa sem Pedidos nem Materiais não tem catálogo: a rota responde 403 e a
  // tela segue com item avulso, em vez de quebrar.
  const { data: catalogo } = useSWR<Produto[] | { error: string }>("/api/products", fetcher, { shouldRetryOnError: false });
  const produtos = Array.isArray(catalogo) ? catalogo : [];

  const [itens, setItens] = useState<Item[] | null>(null);
  const [sujo, setSujo] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (salvos && !sujo) setItens(salvos.map((s) => ({ ...s, chave: novaChave() })));
  }, [salvos, sujo]);

  if (!itens) return <p className="text-xs text-neutral-400">Carregando itens...</p>;

  function alterar(chave: string, mudanca: Partial<Item>) {
    setItens((l) => l!.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
    setSujo(true);
  }

  function adicionarDoCatalogo() {
    const p = produtos.find((x) => x.id === escolhido);
    if (!p) return;
    setItens((l) => [
      ...l!,
      {
        chave: novaChave(),
        productId: p.id,
        nomeProduto: p.name,
        precoTabelaCents: p.priceCents,
        precoUnitCents: p.priceCents,
        quantidade: 1,
        cobranca: p.cobranca ?? "UNICA",
      },
    ]);
    setEscolhido("");
    setSujo(true);
  }

  function adicionarAvulso() {
    setItens((l) => [
      ...l!,
      { chave: novaChave(), productId: null, nomeProduto: "", precoTabelaCents: 0, precoUnitCents: 0, quantidade: 1, cobranca: "UNICA" },
    ]);
    setSujo(true);
  }

  const total = itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);
  const mensal = itens.filter((i) => i.cobranca === "MENSAL").reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);

  async function salvar() {
    if (itens!.some((i) => !i.nomeProduto.trim())) return setErro("dê um nome a todos os itens");
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/negociacoes/${negociacaoId}/itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: itens!.map(({ chave: _chave, ...i }) => ({
            ...i,
            nomeProduto: i.nomeProduto.trim(),
            // Item avulso não tem preço de tabela: vale o próprio preço.
            precoTabelaCents: i.productId ? i.precoTabelaCents : i.precoUnitCents,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return setErro(typeof body.error === "string" ? body.error : "não deu pra salvar os itens");
      }
      setSujo(false);
      await mutate();
      onMudou();
    } finally {
      setOcupado(false);
    }
  }

  async function gerarPedido() {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/negociacoes/${negociacaoId}/pedido`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(typeof body.error === "string" ? body.error : "não deu pra gerar o pedido");
      onMudou();
    } finally {
      setOcupado(false);
    }
  }

  const campo = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-50";
  const pedidoAtivo = pedidos.find((p) => p.status !== "CANCELADO");

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Produtos e serviços</h3>

      {itens.length === 0 && <p className="text-xs text-neutral-400 mb-2">Nenhum item. O valor da negociação é o que você digitou acima.</p>}

      <ul className="flex flex-col gap-2 mb-2">
        {itens.map((i) => {
          const desconto = i.precoTabelaCents > i.precoUnitCents ? i.precoTabelaCents - i.precoUnitCents : 0;
          return (
            <li key={i.chave} className="rounded-md border border-neutral-200 p-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={i.nomeProduto}
                  onChange={(e) => alterar(i.chave, { nomeProduto: e.target.value })}
                  disabled={!editavel || !!i.productId}
                  placeholder="Nome do item"
                  className={`${campo} flex-1 min-w-0`}
                />
                {editavel && (
                  <button
                    onClick={() => {
                      setItens((l) => l!.filter((x) => x.chave !== i.chave));
                      setSujo(true);
                    }}
                    className="text-neutral-300 hover:text-red-600"
                    aria-label="Remover item"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1 text-neutral-500">
                  Qtd
                  <input
                    value={i.quantidade}
                    onChange={(e) => alterar(i.chave, { quantidade: Math.max(1, Math.min(9999, Math.floor(Number(e.target.value)) || 1)) })}
                    disabled={!editavel}
                    inputMode="numeric"
                    className={`${campo} w-16`}
                  />
                </label>
                <label className="flex items-center gap-1 text-neutral-500">
                  Preço (R$)
                  <input
                    defaultValue={emReais(i.precoUnitCents)}
                    key={`${i.chave}-${i.precoUnitCents}`}
                    onBlur={(e) => {
                      const c = reaisParaCentavos(e.target.value);
                      if (c !== null) alterar(i.chave, { precoUnitCents: c });
                    }}
                    disabled={!editavel}
                    inputMode="decimal"
                    className={`${campo} w-24`}
                  />
                </label>
                <select
                  value={i.cobranca}
                  onChange={(e) => alterar(i.chave, { cobranca: e.target.value as "UNICA" | "MENSAL" })}
                  disabled={!editavel}
                  className={campo}
                >
                  <option value="UNICA">Única</option>
                  <option value="MENSAL">Mensal</option>
                </select>
                <span className="ml-auto tabular-nums text-neutral-700">{centsToBRL(i.precoUnitCents * i.quantidade)}</span>
              </div>
              {desconto > 0 && (
                <p className="text-[11px] text-amber-700">
                  Desconto de {centsToBRL(desconto)} por unidade sobre a tabela ({centsToBRL(i.precoTabelaCents)})
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {editavel && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {produtos.length > 0 && (
            <>
              <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={`${campo} flex-1 min-w-[10rem]`}>
                <option value="">Adicionar do catálogo…</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {centsToBRL(p.priceCents)}
                    {p.cobranca === "MENSAL" ? "/mês" : ""}
                  </option>
                ))}
              </select>
              <button onClick={adicionarDoCatalogo} disabled={!escolhido} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40">
                Adicionar
              </button>
            </>
          )}
          <button onClick={adicionarAvulso} className="text-xs text-accent hover:underline">
            + Item avulso
          </button>
        </div>
      )}

      {itens.length > 0 && (
        <p className="text-xs text-neutral-600 tabular-nums mb-2">
          Total {centsToBRL(total)}
          {mensal > 0 && <> · {centsToBRL(mensal)}/mês no MRR</>}
        </p>
      )}

      {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {editavel && sujo && (
          <button onClick={salvar} disabled={ocupado} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Salvar itens
          </button>
        )}
        {temPedidos && !pedidoAtivo && itens.length > 0 && !sujo && (
          <button onClick={gerarPedido} disabled={ocupado} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50">
            Gerar pedido
          </button>
        )}
      </div>

      {pedidos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {pedidos.map((p) => (
            <li key={p.id} className="text-xs text-neutral-600">
              <Link href="/pedidos" className="text-accent hover:underline">
                Pedido #{p.numero}
              </Link>{" "}
              · {STATUS_PEDIDO[p.status] ?? p.status}
              {p.status === "FECHADO" && (p.pago ? " · pago" : " · a receber")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
