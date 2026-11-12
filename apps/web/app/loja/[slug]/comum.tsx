import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import type { CarroPublico } from "@/lib/vitrine";

/** Peças da vitrine pública que servem ao servidor e ao navegador. */

export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function fotoUrl(slug: string, fotoId: string) {
  return `/api/loja/${slug}/fotos/${fotoId}`;
}

export function resumo(c: Pick<CarroPublico, "km" | "cambio" | "combustivel">) {
  return [`${c.km.toLocaleString("pt-BR")} km`, c.cambio, c.combustivel].filter(Boolean).join(" · ");
}

export function titulo(c: CarroPublico) {
  return nomeDoVeiculo(c);
}

/** Ícone do WhatsApp, inline (página pública sem dependência externa). */
export function IconeWhatsapp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3ZM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
    </svg>
  );
}
