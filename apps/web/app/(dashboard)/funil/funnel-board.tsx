"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import { contactLabel, formatPhoneDisplay, type ContactRef } from "@/lib/contact";
import { centsToBRL } from "@/lib/billing";

type StageDef = { id: string; name: string; color: string; position: number };
type TenantUser = { id: string; name: string };

type Contact = ContactRef & {
  stageId: string | null;
  stage: StageDef | null;
  dealValueCents: number;
  latestConversation: { id: string; assignedToId: string | null } | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const UNSTAGED = "__unstaged__";

export function FunnelBoard() {
  const router = useRouter();
  const { data: contacts, mutate } = useSWR<Contact[]>("/api/contacts", fetcher, { refreshInterval: 5000 });
  const { data: stages } = useSWR<StageDef[]>("/api/stages", fetcher);
  const { data: users } = useSWR<TenantUser[]>("/api/users", fetcher);
  const [userFilter, setUserFilter] = useState("");
  const [editingValueId, setEditingValueId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!contacts) return undefined;
    if (!userFilter) return contacts;
    return contacts.filter((c) => c.latestConversation?.assignedToId === userFilter);
  }, [contacts, userFilter]);

  const columns = useMemo(() => {
    const list = [...(stages ?? [])].sort((a, b) => a.position - b.position);
    return [{ id: UNSTAGED, name: "Sem etapa", color: "#9CA3AF" }, ...list];
  }, [stages]);

  async function moveStage(contactId: string, stageId: string) {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: stageId === UNSTAGED ? null : stageId }),
    });
    mutate();
  }

  async function saveDealValue(contactId: string, value: string) {
    const cents = Math.round(parseFloat(value.replace(",", ".")) * 100);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealValueCents: Number.isFinite(cents) && cents >= 0 ? cents : 0 }),
    });
    setEditingValueId(null);
    mutate();
  }

  async function handleOpenConversation(contact: Contact) {
    if (contact.latestConversation) {
      router.push(`/inbox?open=${contact.latestConversation.id}`);
      return;
    }
    const res = await fetch(`/api/contacts/${contact.id}/start-conversation`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(typeof body.error === "string" ? body.error : "não deu pra iniciar a conversa");
      return;
    }
    const conversation = await res.json();
    router.push(`/inbox?open=${conversation.id}`);
  }

  if (!visible || !stages) return <p className="text-sm text-neutral-400">Carregando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Gestão de Leads</h1>
          <span className="text-xs font-mono rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">
            {visible.length} contatos
          </span>
        </div>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-1.5"
        >
          <option value="">Usuário: todos</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {stages.length === 0 && (
        <p className="text-sm text-neutral-500 rounded-lg border border-dashed border-neutral-300 px-4 py-6 mb-4">
          Nenhuma etapa cadastrada ainda — configure as etapas do seu processo em{" "}
          <a href="/etapas" className="text-accent hover:underline">
            Etapas do funil
          </a>{" "}
          pra elas aparecerem aqui como colunas.
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colContacts = visible.filter((c) => (c.stageId ?? UNSTAGED) === col.id);
          const totalCents = colContacts.reduce((sum, c) => sum + c.dealValueCents, 0);
          return (
            <div key={col.id} className="w-72 shrink-0">
              <div className="rounded-t-md h-1.5" style={{ backgroundColor: col.color }} />
              <div className="border border-t-0 border-neutral-200 rounded-b-md bg-neutral-50 px-3 py-2.5 flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-neutral-800 truncate">{col.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 text-white"
                    style={{ backgroundColor: col.color }}
                  >
                    {colContacts.length}
                  </span>
                  <span className="text-[10px] rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500">
                    {centsToBRL(totalCents)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {colContacts.length === 0 && <p className="text-xs text-neutral-400 px-1">Sem contatos</p>}
                {colContacts.map((contact) => {
                  const assignedUser = users?.find((u) => u.id === contact.latestConversation?.assignedToId);
                  return (
                    <div key={contact.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar contact={contact} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{contactLabel(contact)}</p>
                          <p className="text-[10px] text-neutral-400 truncate">{formatPhoneDisplay(contact)}</p>
                        </div>
                      </div>
                      {editingValueId === contact.id ? (
                        <input
                          autoFocus
                          defaultValue={(contact.dealValueCents / 100).toFixed(2)}
                          onBlur={(e) => saveDealValue(contact.id, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className="w-full text-xs rounded-md border border-accent px-2 py-1 mb-2 focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingValueId(contact.id)}
                          className="block w-full text-left text-xs text-neutral-600 hover:text-accent mb-2"
                          title="Editar valor do negócio"
                        >
                          {centsToBRL(contact.dealValueCents)}
                        </button>
                      )}
                      {assignedUser && (
                        <span className="inline-block text-[10px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 mb-2">
                          {assignedUser.name}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={contact.stageId ?? UNSTAGED}
                          onChange={(e) => moveStage(contact.id, e.target.value)}
                          className="flex-1 text-xs rounded-md border border-neutral-300 px-2 py-1"
                        >
                          <option value={UNSTAGED}>Sem etapa</option>
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleOpenConversation(contact)}
                          title="Abrir conversa"
                          className="shrink-0 text-xs rounded-md border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                        >
                          💬
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
