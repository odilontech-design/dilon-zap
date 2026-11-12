"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { ROTULO_STATUS, faixaDeEstoque, fichaParaCliente, placaParaTela, type StatusVeiculo } from "@/lib/veiculos-regras";

type Carro = {
  id: string;
  placa: string | null;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  kmInformado: boolean;
  precoCents: number;
  status: StatusVeiculo;
  dias: number;
  capaId: string | null;
  totalFotos: number;
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "erro ao carregar");
    return r.json();
  });

/**
 * "Enviar carro" no Inbox: o vendedor procura no estoque e manda a ficha com
 * as fotos na conversa aberta, sem sair dela. É o "ainda tem?" respondido em
 * dois cliques.
 *
 * "Ficha no campo" põe o texto no campo de digitação para o vendedor ajustar
 * (uma condição especial, "faço por 89"), em vez de mandar direto.
 */
export function EscolherVeiculo({
  conversationId,
  onFechar,
  onEnviado,
  onUsarTexto,
}: {
  conversationId: string;
  onFechar: () => void;
  onEnviado: () => void;
  onUsarTexto: (texto: string) => void;
}) {
  const { data, error } = useSWR<{ veiculos: Carro[] }>("/api/veiculos", fetcher);
  const [busca, setBusca] = useState("");
  const [fotos, setFotos] = useState(5);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const ordem: Record<StatusVeiculo, number> = { DISPONIVEL: 0, RESERVADO: 1, PREPARACAO: 2, VENDIDO: 3, DEVOLVIDO: 4 };
  const lista = (data?.veiculos ?? [])
    .filter((c) => !termo || `${c.marca} ${c.modelo} ${c.versao ?? ""} ${c.anoModelo} ${c.placa ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => ordem[a.status] - ordem[b.status] || a.precoCents - b.precoCents);

  async function enviar(c: Carro) {
    setErro(null);
    setEnviandoId(c.id);
    const r = await fetch(`/api/veiculos/${c.id}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, fotos }),
    });
    setEnviandoId(null);
    if (!r.ok) {
      setErro((await r.json().catch(() => null))?.error ?? "não deu para enviar");
      return;
    }
    // O modal fica aberto: é comum mandar duas ou três opções para o mesmo cliente.
    setEnviados((s) => new Set(s).add(c.id));
    onEnviado();
  }

  async function usarTexto(c: Carro) {
    setErro(null);
    const r = await fetch(`/api/veiculos/${c.id}`);
    if (!r.ok) {
      setErro("não deu para carregar a ficha");
      return;
    }
    const v = await r.json();
    onUsarTexto(fichaParaCliente(v) + (v.linkVitrine ? `\n\n${v.linkVitrine}` : ""));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-neutral-200 bg-surface">
        <header className="flex flex-col gap-2 border-b border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Enviar carro</h2>
            <button onClick={onFechar} className="text-sm text-neutral-500 hover:text-neutral-800">
              fechar
            </button>
          </div>
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca, modelo, ano ou placa"
            className="w-full rounded-md border border-neutral-300 bg-surface px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            Fotos por carro:
            <select value={fotos} onChange={(e) => setFotos(Number(e.target.value))} className="rounded border border-neutral-300 bg-surface px-1.5 py-0.5">
              {[0, 1, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "só a ficha" : n}
                </option>
              ))}
            </select>
          </label>
        </header>
        {erro && <p className="px-4 pt-3 text-xs text-red-600">{erro}</p>}
        <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {error && <li className="p-4 text-sm text-red-600">{(error as Error).message}</li>}
          {!data && !error && <li className="p-4 text-sm text-neutral-500">Carregando…</li>}
          {data && lista.length === 0 && <li className="p-4 text-sm text-neutral-500">Nenhum carro no estoque{termo ? " com essa busca" : ""}.</li>}
          {lista.map((c) => {
            const parado = faixaDeEstoque(c.dias) !== "novo";
            return (
              <li key={c.id} className="flex items-center gap-3 p-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-neutral-100">
                  {c.capaId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/veiculos/fotos/${c.capaId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.marca} {c.modelo} {c.versao ?? ""} {c.anoFabricacao}/{c.anoModelo}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {centsToBRL(c.precoCents)} · {c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : "km não informada"}{c.placa ? ` · ${placaParaTela(c.placa)}` : ""}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {ROTULO_STATUS[c.status]} · {c.totalFotos} foto(s){parado ? ` · ${c.dias} dias em estoque` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    onClick={() => enviar(c)}
                    disabled={enviandoId === c.id}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${enviados.has(c.id) ? "bg-accent/10 text-accent" : "bg-accent text-white hover:opacity-90"} disabled:opacity-50`}
                  >
                    {enviandoId === c.id ? "Enviando…" : enviados.has(c.id) ? "Enviado ✓" : "Enviar"}
                  </button>
                  <button onClick={() => usarTexto(c)} className="text-[11px] text-neutral-500 hover:text-accent">
                    ficha no campo
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
