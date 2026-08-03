"use client";

import useSWR from "swr";
import { contactLabel } from "@/lib/contact";

type PipelineStage = "NOVO_LEAD" | "EM_CONTATO" | "PROPOSTA_ENVIADA" | "FECHADO" | "PERDIDO";

type Contact = {
  id: string;
  name: string | null;
  waJid: string;
  phoneNumber: string | null;
  pipelineStage: PipelineStage;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "NOVO_LEAD", label: "Novo lead" },
  { key: "EM_CONTATO", label: "Em contato" },
  { key: "PROPOSTA_ENVIADA", label: "Proposta enviada" },
  { key: "FECHADO", label: "Fechado" },
  { key: "PERDIDO", label: "Perdido" },
];

export function FunnelBoard() {
  const { data: contacts, mutate } = useSWR<Contact[]>("/api/contacts", fetcher, {
    refreshInterval: 5000,
  });

  async function moveStage(contactId: string, pipelineStage: PipelineStage) {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage }),
    });
    mutate();
  }

  if (!contacts) return <p className="text-sm text-neutral-400">Carregando...</p>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const stageContacts = contacts.filter((c) => c.pipelineStage === stage.key);
        return (
          <div key={stage.key} className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">{stage.label}</h3>
              <span className="text-xs text-neutral-400">{stageContacts.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {stageContacts.map((contact) => (
                <div key={contact.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <p className="text-sm font-medium mb-2">{contactLabel(contact)}</p>
                  <select
                    value={contact.pipelineStage}
                    onChange={(e) => moveStage(contact.id, e.target.value as PipelineStage)}
                    className="w-full text-xs rounded-md border border-neutral-300 px-2 py-1"
                  >
                    {STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {stageContacts.length === 0 && (
                <p className="text-xs text-neutral-400 px-1">Vazio</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
