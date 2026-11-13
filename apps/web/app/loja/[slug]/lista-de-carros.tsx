"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CarroPublico } from "@/lib/vitrine";
import { brl, fotoUrl } from "./comum";

type Ordem = "recentes" | "menor" | "maior" | "km";

/** Os carros com busca, filtro de marca e preço, tudo no navegador (o estoque de uma loja cabe numa página). */
export function ListaDeCarros({ slug, carros }: { slug: string; carros: CarroPublico[] }) {
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  const marcas = useMemo(() => [...new Set(carros.map((c) => c.marca))].sort((a, b) => a.localeCompare(b, "pt-BR")), [carros]);
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const max = Number(precoMax.replace(/\D/g, "")) * 100;
    const f = carros.filter(
      (c) =>
        (!marca || c.marca === marca) &&
        (!max || c.precoCents <= max) &&
        (!termo || `${c.marca} ${c.modelo} ${c.versao ?? ""} ${c.anoModelo} ${c.cor ?? ""}`.toLowerCase().includes(termo))
    );
    if (ordem === "menor") f.sort((a, b) => a.precoCents - b.precoCents);
    if (ordem === "maior") f.sort((a, b) => b.precoCents - a.precoCents);
    if (ordem === "km") f.sort((a, b) => (a.kmInformado ? a.km : Infinity) - (b.kmInformado ? b.km : Infinity)); // sem km informada vai para o fim
    return f;
  }, [carros, busca, marca, precoMax, ordem]);

  const campo = "rounded-lg border border-neutral-200 bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-[var(--loja)] focus:ring-2 focus:ring-[var(--loja)]/20";
  // As marcas com mais carros viram atalhos de um toque.
  const atalhos = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of carros) n.set(c.marca, (n.get(c.marca) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, 8);
  }, [carros]);
  const novidade = (c: CarroPublico) => Date.now() - new Date(c.entradaEm).getTime() < 7 * 86_400_000;
  return (
    <div id="estoque" className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-surface p-3 shadow-sm md:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_180px_150px_170px]">
          <input aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo, ano, cor…" className={`${campo} col-span-2 sm:col-span-1`} />
          <select aria-label="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} className={campo}>
            <option value="">Todas as marcas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input aria-label="Preço máximo" value={precoMax} onChange={(e) => setPrecoMax(e.target.value)} placeholder="Até R$" inputMode="numeric" className={campo} />
          <select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={`${campo} col-span-2 sm:col-span-1`}>
            <option value="recentes">Mais recentes</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
            <option value="km">Menor km</option>
          </select>
        </div>
        {atalhos.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Marcas mais procuradas">
            {atalhos.map(([m, qtd]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMarca(marca === m ? "" : m)}
                aria-pressed={marca === m}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${marca === m ? "border-transparent" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
                style={marca === m ? { background: "var(--loja)", color: "var(--loja-texto)" } : undefined}
              >
                {m} · {qtd}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-sm text-neutral-500">
        {lista.length} {lista.length === 1 ? "veículo" : "veículos"} {marca || busca || precoMax ? "com esses filtros" : "à venda"}
      </p>
      {lista.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">Nenhum veículo com esses filtros. Tire um filtro ou chame a loja no WhatsApp: podemos procurar o carro para você.</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Link key={c.id} href={`/loja/${slug}/${c.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl">
            <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
              {c.fotos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoUrl(slug, c.fotos[0].id)} alt={`${c.marca} ${c.modelo} ${c.versao ?? ""} ${c.anoModelo}`.replace(/\s+/g, " ").trim()} loading="lazy" className="h-full w-full object-cover text-transparent transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">Fotos em breve</div>
              )}
              <div className="absolute left-3 top-3 flex gap-2">
                {c.status === "RESERVADO" && <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-medium text-white shadow">Reservado</span>}
                {c.status !== "RESERVADO" && novidade(c) && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium shadow" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
                    Novidade
                  </span>
                )}
              </div>
              {c.fotos.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{c.fotos.length} fotos</span>}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-neutral-500">{c.marca}</span>
              <span className="font-semibold leading-tight">
                {c.modelo} {c.versao ?? ""}
              </span>
              <div className="flex flex-wrap gap-1.5 text-xs text-neutral-600">
                <span className="rounded-md bg-neutral-100 px-2 py-1">{c.anoFabricacao}/{c.anoModelo}</span>
                {c.kmInformado && <span className="rounded-md bg-neutral-100 px-2 py-1">{c.km.toLocaleString("pt-BR")} km</span>}
                {c.cambio && <span className="rounded-md bg-neutral-100 px-2 py-1">{c.cambio}</span>}
                {c.combustivel && <span className="rounded-md bg-neutral-100 px-2 py-1">{c.combustivel}</span>}
              </div>
              <div className="mt-auto flex items-end justify-between pt-2">
                <span className="text-2xl font-bold tracking-tight">{brl(c.precoCents)}</span>
                <span className="text-xs font-medium opacity-0 transition group-hover:opacity-100" style={{ color: "var(--loja)" }}>
                  Ver detalhes →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
