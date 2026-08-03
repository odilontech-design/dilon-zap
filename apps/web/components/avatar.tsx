"use client";

import { useState } from "react";
import { contactLabel, hasActiveStatus, type ContactRef } from "@/lib/contact";

export function Avatar({ contact, size = 36 }: { contact: ContactRef; size?: number }) {
  const [broken, setBroken] = useState(false);
  const label = contactLabel(contact);

  const inner =
    contact.avatarUrl && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element -- foto vem de um CDN do WhatsApp, domínio não é fixo
      <img
        src={contact.avatarUrl}
        alt={label}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    ) : (
      <div
        className="rounded-full bg-accent/15 text-accent flex items-center justify-center font-medium shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {label.charAt(0).toUpperCase()}
      </div>
    );

  // Anel verde igual WhatsApp quando o contato tem Status postado nas
  // últimas 24h (ver hasActiveStatus) — não distingue visto/não visto,
  // já que o sistema não tem um visualizador de Status pra marcar leitura.
  if (!hasActiveStatus(contact)) return inner;

  return (
    <div
      className="rounded-full shrink-0 ring-2 ring-emerald-500 ring-offset-2 ring-offset-white"
      style={{ width: size, height: size }}
      title="Status disponível"
    >
      {inner}
    </div>
  );
}
