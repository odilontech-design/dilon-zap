"use client";

import { useState } from "react";
import useSWR from "swr";

type ContactBlock = {
  id: string;
  waJid: string;
  reason: string | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function displayJid(waJid: string) {
  return waJid.replace("@s.whatsapp.net", "");
}

export function BlocksPanel() {
  const { data: blocks, mutate } = useSWR<ContactBlock[]>("/api/blocks", fetcher);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!digits) return;
    await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waJid: `${digits}@s.whatsapp.net`, reason: reason || undefined }),
    });
    setPhone("");
    setReason("");
    mutate();
  }

  async function handleRemove(id: string) {
    await fetch(`/api/blocks/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-neutral-600 mb-6">
        Número aqui não recebe mais nenhuma mensagem — nem resposta manual, nem automação, nem
        campanha (a partir da Fase 2). Use quando alguém pedir pra não receber mais contato.
      </p>

      <form onSubmit={handleCreate} className="rounded-lg border border-neutral-200 bg-surface p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-1">Número (com DDI/DDD)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999999999"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-700 mb-1">Motivo (opcional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Bloquear
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {blocks?.length === 0 && <p className="text-sm text-neutral-500">Nenhum contato bloqueado.</p>}
        {blocks?.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface p-4 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-sm font-medium">{displayJid(b.waJid)}</p>
              {b.reason && <p className="text-xs text-neutral-500">{b.reason}</p>}
            </div>
            <button onClick={() => handleRemove(b.id)} className="text-xs text-accent hover:underline shrink-0">
              Desbloquear
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
