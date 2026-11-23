"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brl, fotoUrl, IconeWhatsapp } from "./comum";
import { registrarContato } from "./rastreio";

const CHAVE = "zap-oferta-vista";

/** A oferta que abre ao entrar no site: uma vez por visita (some ao fechar, com Esc ou clicando fora). */
export function OfertaAoEntrar({ slug, carro, whatsapp }: { slug: string; carro: { id: string; nome: string; precoCents: number; precoOculto?: boolean; fotoId: string | null }; whatsapp: string | null }) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`${CHAVE}:${carro.id}`)) return;
    } catch {
      // sem sessionStorage (navegação privada): mostra mesmo assim
    }
    const t = setTimeout(() => setAberta(true), 1200);
    return () => clearTimeout(t);
  }, [carro.id]);
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });
  function fechar() {
    setAberta(false);
    try {
      sessionStorage.setItem(`${CHAVE}:${carro.id}`, "1");
    } catch {
      // ignora
    }
  }
  if (!aberta) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Oferta: ${carro.nome}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={fechar}>
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Fechar" onClick={fechar} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg text-white">✕</button>
        <div className="relative aspect-square bg-neutral-100">
          {carro.fotoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl(slug, carro.fotoId, 800)} alt={carro.nome} className="absolute inset-0 h-full w-full object-contain" />
          )}
          <span className="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide shadow" style={{ background: "var(--loja2)", color: "var(--loja2-texto)" }}>Oferta</span>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-lg font-bold leading-tight">{carro.nome}</p>
          <p className="text-3xl font-extrabold tracking-tight">{carro.precoOculto ? "Sob consulta" : brl(carro.precoCents)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={`/loja/${slug}/${carro.id}`} onClick={fechar} className="flex-1 rounded-xl px-4 py-3 text-center text-sm font-bold" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>Ver a oferta</Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" onClick={() => { registrarContato("whatsapp", carro.precoCents); fechar(); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white">
                <IconeWhatsapp className="h-5 w-5" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
