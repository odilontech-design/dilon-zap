"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CarroPublico } from "@/lib/vitrine";
import { brl, fotoUrl, resumo } from "./comum";

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
    if (ordem === "km") f.sort((a, b) => a.km - b.km);
    return f;
  }, [carros, busca, marca, precoMax, ordem]);

  const campo = "rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_160px_170px]">
        <input aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo, ano, cor…" className={campo} />
        <select aria-label="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} className={campo}>
          <option value="">Todas as marcas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input aria-label="Preço máximo" value={precoMax} onChange={(e) => setPrecoMax(e.target.value)} placeholder="Até R$" inputMode="numeric" className={campo} />
        <select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={campo}>
          <option value="recentes">Mais recentes</option>
          <option value="menor">Menor preço</option>
          <option value="maior">Maior preço</option>
          <option value="km">Menor km</option>
        </select>
      </div>
      <p className="text-sm text-neutral-500">
        {lista.length} {lista.length === 1 ? "veículo" : "veículos"}
      </p>
      {lista.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Nenhum veículo com esses filtros.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Link key={c.id} href={`/loja/${slug}/${c.id}`} className="group overflow-hidden rounded-xl border border-neutral-200 bg-surface transition hover:shadow-md">
            <div className="relative aspect-[4/3] bg-neutral-100">
              {c.fotos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoUrl(slug, c.fotos[0].id)} alt={`${c.marca} ${c.modelo}`} loading="lazy" className="h-full w-full object-cover text-transparent" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">Fotos em breve</div>
              )}
              {c.status === "RESERVADO" && <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-medium text-white">Reservado</span>}
            </div>
            <div className="flex flex-col gap-1 p-4">
              <span className="text-xs uppercase tracking-wide text-neutral-500">{c.marca}</span>
              <span className="font-semibold leading-tight group-hover:text-accent">
                {c.modelo} {c.versao ?? ""}
              </span>
              <span className="text-sm text-neutral-500">
                {c.anoFabricacao}/{c.anoModelo} · {resumo(c)}
              </span>
              <span className="mt-2 text-xl font-bold">{brl(c.precoCents)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
