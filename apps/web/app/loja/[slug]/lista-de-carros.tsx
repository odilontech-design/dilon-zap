"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CarroPublico } from "@/lib/vitrine";
import { CartaoDeCarro } from "./cartao-de-carro";

type Ordem = "recentes" | "menor" | "maior" | "km";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Os carros com busca e filtros (marca, modelo, ano, preço, câmbio, combustível),
 * tudo no navegador: o estoque de uma loja cabe numa página. Os filtros começam
 * pelo endereço (?marca=…&max=…&cambio=…), que é como a busca rápida da abertura
 * chega aqui. Marca ou busca vindas da URL também funcionam como link compartilhável.
 */
export function ListaDeCarros({ slug, carros, whatsapp = null, baseUrl, titulo }: { slug: string; carros: CarroPublico[]; whatsapp?: string | null; baseUrl: string; titulo?: string }) {
  const sp = useSearchParams();
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anoMin, setAnoMin] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [cambio, setCambio] = useState("");
  const [comb, setComb] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [maisFiltros, setMaisFiltros] = useState(false);

  // A URL manda: busca rápida da abertura, links de marca e links compartilhados.
  const chaveDaUrl = sp.toString();
  useEffect(() => {
    setBusca(sp.get("q") ?? "");
    setMarca(sp.get("marca") ?? "");
    setModelo(sp.get("modelo") ?? "");
    setAnoMin(sp.get("ano") ?? "");
    setPrecoMax(sp.get("max") ?? "");
    setCambio(sp.get("cambio") ?? "");
    setComb(sp.get("comb") ?? "");
    if (sp.get("cambio") || sp.get("comb") || sp.get("ano") || sp.get("modelo")) setMaisFiltros(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaUrl]);

  const marcas = useMemo(() => [...new Set(carros.map((c) => c.marca))].sort((a, b) => a.localeCompare(b, "pt-BR")), [carros]);
  const modelos = useMemo(() => [...new Set(carros.filter((c) => !marca || c.marca === marca).map((c) => c.modelo))].sort((a, b) => a.localeCompare(b, "pt-BR")), [carros, marca]);
  const anos = useMemo(() => [...new Set(carros.map((c) => c.anoModelo))].sort((a, b) => b - a), [carros]);
  const cambios = useMemo(() => [...new Set(carros.map((c) => c.cambio).filter(Boolean) as string[])].sort(), [carros]);
  const combs = useMemo(() => [...new Set(carros.map((c) => c.combustivel).filter(Boolean) as string[])].sort(), [carros]);

  // "Novidade" só quando é de fato raro: um estoque recém-importado teria o selo em todos os carros.
  const novos = useMemo(() => {
    const recentes = carros.filter((c) => Date.now() - new Date(c.entradaEm).getTime() < 7 * 86_400_000);
    return recentes.length <= carros.length * 0.3 ? new Set(recentes.map((c) => c.id)) : new Set<string>();
  }, [carros]);

  const lista = useMemo(() => {
    const termo = semAcento(busca.trim());
    const max = Number(precoMax.replace(/\D/g, "")) * 100;
    const f = carros.filter(
      (c) =>
        (!marca || c.marca === marca) &&
        (!modelo || c.modelo === modelo) &&
        (!anoMin || c.anoModelo >= Number(anoMin)) &&
        (!max || c.precoCents <= max) &&
        (!cambio || c.cambio === cambio) &&
        (!comb || c.combustivel === comb) &&
        (!termo || semAcento(`${c.marca} ${c.modelo} ${c.versao ?? ""} ${c.anoModelo} ${c.cor ?? ""}`).includes(termo)),
    );
    if (ordem === "menor") f.sort((a, b) => a.precoCents - b.precoCents);
    if (ordem === "maior") f.sort((a, b) => b.precoCents - a.precoCents);
    if (ordem === "km") f.sort((a, b) => (a.kmInformado ? a.km : Infinity) - (b.kmInformado ? b.km : Infinity)); // sem km informada vai para o fim
    return f;
  }, [carros, busca, marca, modelo, anoMin, precoMax, cambio, comb, ordem]);

  const filtrando = !!(busca || marca || modelo || anoMin || precoMax || cambio || comb);
  const limpar = () => {
    setBusca(""); setMarca(""); setModelo(""); setAnoMin(""); setPrecoMax(""); setCambio(""); setComb("");
    if (typeof window !== "undefined" && window.location.search) window.history.replaceState(null, "", `${window.location.pathname}#estoque`);
  };

  const campo = "w-full rounded-xl border border-neutral-200 bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-[var(--loja)] focus:ring-2 focus:ring-[var(--loja)]/20";
  const rotulo = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <div id="estoque" className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">{titulo ?? "Nossos veículos"}</h2>
        <p className="text-sm text-neutral-500" aria-live="polite">
          {lista.length} {lista.length === 1 ? "veículo" : "veículos"} {filtrando ? "com esses filtros" : "à venda"}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-surface p-3 shadow-sm md:p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 md:col-span-2">
            <span className="sr-only">Buscar</span>
            <input aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por marca, modelo, ano ou cor" className={campo} />
          </label>
          <label>
            <span className={rotulo}>Marca</span>
            <select aria-label="Marca" value={marca} onChange={(e) => { setMarca(e.target.value); setModelo(""); }} className={campo}>
              <option value="">Todas</option>
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            <span className={rotulo}>Preço até</span>
            <input aria-label="Preço máximo" value={precoMax} onChange={(e) => setPrecoMax(e.target.value)} placeholder="R$" inputMode="numeric" className={campo} />
          </label>
          <label>
            <span className={rotulo}>Ordenar por</span>
            <select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={campo}>
              <option value="recentes">Mais recentes</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="km">Menor km</option>
            </select>
          </label>
          <label className={maisFiltros ? "" : "hidden"}>
            <span className={rotulo}>Modelo</span>
            <select aria-label="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} className={campo}>
              <option value="">Todos</option>
              {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className={maisFiltros ? "" : "hidden"}>
            <span className={rotulo}>Ano a partir de</span>
            <select aria-label="Ano a partir de" value={anoMin} onChange={(e) => setAnoMin(e.target.value)} className={campo}>
              <option value="">Qualquer</option>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {cambios.length > 1 && (
            <label className={maisFiltros ? "" : "hidden"}>
              <span className={rotulo}>Câmbio</span>
              <select aria-label="Câmbio" value={cambio} onChange={(e) => setCambio(e.target.value)} className={campo}>
                <option value="">Todos</option>
                {cambios.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          {combs.length > 1 && (
            <label className={maisFiltros ? "" : "hidden"}>
              <span className={rotulo}>Combustível</span>
              <select aria-label="Combustível" value={comb} onChange={(e) => setComb(e.target.value)} className={campo}>
                <option value="">Todos</option>
                {combs.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={() => setMaisFiltros(!maisFiltros)} className="font-medium" style={{ color: "var(--loja)" }} aria-expanded={maisFiltros}>
            {maisFiltros ? "Menos filtros" : <>Mais filtros<span className="hidden md:inline"> (modelo, ano, câmbio, combustível)</span></>}
          </button>
          {filtrando && (
            <button type="button" onClick={limpar} className="ml-auto font-medium text-neutral-500 underline-offset-2 hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-surface p-10 text-center">
          <p className="font-medium">Nenhum veículo com esses filtros.</p>
          <p className="mt-1 text-sm text-neutral-500">Tire um filtro ou fale com a loja: podemos procurar o carro para você.</p>
          <button type="button" onClick={limpar} className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
            Ver todos os veículos
          </button>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <CartaoDeCarro key={c.id} slug={slug} c={c} whatsapp={whatsapp} baseUrl={baseUrl} novidade={novos.has(c.id)} />
        ))}
      </div>
    </div>
  );
}
