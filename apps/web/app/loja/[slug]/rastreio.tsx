"use client";

import { IconeWhatsapp } from "./comum";

type Janela = Window & { fbq?: (...a: unknown[]) => void; gtag?: (...a: unknown[]) => void };

/** Avisa o pixel e o Analytics de que a visita virou contato. Sem eles, não faz nada. */
export function registrarContato(tipo: "whatsapp" | "formulario", valorCents?: number) {
  const w = window as Janela;
  const valor = valorCents ? { value: valorCents / 100, currency: "BRL" } : {};
  w.fbq?.("track", tipo === "whatsapp" ? "Contact" : "Lead", valor);
  w.gtag?.("event", "generate_lead", { method: tipo, ...valor });
}

/** O botão verde do WhatsApp, contando o clique como contato. */
export function BotaoWhatsapp({ href, className, children, valorCents }: { href: string; className: string; children: React.ReactNode; valorCents?: number }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={() => registrarContato("whatsapp", valorCents)}>
      <IconeWhatsapp /> {children}
    </a>
  );
}
