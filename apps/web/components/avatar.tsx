"use client";

import { useState } from "react";
import { contactLabel, type ContactRef } from "@/lib/contact";

export function Avatar({ contact, size = 36 }: { contact: ContactRef; size?: number }) {
  const [broken, setBroken] = useState(false);
  const label = contactLabel(contact);

  if (contact.avatarUrl && !broken) {
    return (
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
    );
  }

  return (
    <div
      className="rounded-full bg-accent/15 text-accent flex items-center justify-center font-medium shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
