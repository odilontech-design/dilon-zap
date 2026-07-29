"use client";

import { useState } from "react";
import useSWR from "swr";

type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED";

type ConversationSummary = {
  id: string;
  ticketNumber: number;
  status: ConversationStatus;
  tags: string[];
  contact: { id: string; name: string | null; waJid: string };
  assignedTo: { id: string; name: string } | null;
  messages: { body: string; direction: "INBOUND" | "OUTBOUND" }[];
};

type ConversationDetail = {
  id: string;
  ticketNumber: number;
  status: ConversationStatus;
  tags: string[];
  contact: { id: string; name: string | null; waJid: string };
  assignedTo: { id: string; name: string } | null;
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  body: string;
  createdAt: string;
};

type TenantUser = { id: string; name: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TABS: { key: ConversationStatus; label: string }[] = [
  { key: "OPEN", label: "Ativos" },
  { key: "PENDING", label: "Pendentes" },
  { key: "RESOLVED", label: "Fechados" },
];

const STATUS_ACTION_LABEL: Record<ConversationStatus, string> = {
  OPEN: "Reabrir",
  PENDING: "Marcar pendente",
  RESOLVED: "Resolver",
};

function contactLabel(contact: { name: string | null; waJid: string }) {
  return contact.name ?? contact.waJid.replace("@s.whatsapp.net", "");
}

export function InboxView() {
  const [tab, setTab] = useState<ConversationStatus>("OPEN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: conversations, mutate: mutateList } = useSWR<ConversationSummary[]>(
    `/api/conversations?status=${tab}`,
    fetcher,
    { refreshInterval: 3000 }
  );

  return (
    <div className="flex h-screen">
      <div className="w-80 shrink-0 border-r border-neutral-200 flex flex-col">
        <h1 className="text-lg font-semibold px-4 py-4 border-b border-neutral-200">Inbox</h1>
        <div className="flex border-b border-neutral-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelectedId(null);
              }}
              className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations?.length === 0 && (
            <p className="text-sm text-neutral-500 px-4 py-6">Nenhuma conversa nessa aba.</p>
          )}
          {conversations?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 ${
                selectedId === c.id ? "bg-neutral-100" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{contactLabel(c.contact)}</p>
                <span className="text-[11px] font-mono text-neutral-400 shrink-0">#{c.ticketNumber}</span>
              </div>
              <p className="text-xs text-neutral-500 truncate mt-0.5">{c.messages[0]?.body ?? ""}</p>
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {c.assignedTo && (
                  <span className="text-[10px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
                    {c.assignedTo.name}
                  </span>
                )}
                {c.tags.map((tag) => (
                  <span key={tag} className="text-[10px] rounded-full bg-accent/10 text-accent px-2 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <ConversationThread conversationId={selectedId} onChanged={() => mutateList()} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationThread({
  conversationId,
  onChanged,
}: {
  conversationId: string;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const { data: conversation, mutate: mutateConversation } = useSWR<ConversationDetail>(
    `/api/conversations/${conversationId}`,
    fetcher
  );
  const { data: messages, mutate: mutateMessages } = useSWR<Message[]>(
    `/api/conversations/${conversationId}/messages`,
    fetcher,
    { refreshInterval: 2000 }
  );
  const { data: users } = useSWR<TenantUser[]>("/api/users", fetcher);

  async function patchConversation(body: Record<string, unknown>) {
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    mutateConversation();
    onChanged();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setDraft("");
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text: draft }),
    });
    mutateMessages();
  }

  async function handleBlock() {
    if (!conversation) return;
    if (
      !confirm(`Bloquear ${contactLabel(conversation.contact)}? Ele para de receber qualquer mensagem.`)
    )
      return;
    await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waJid: conversation.contact.waJid, reason: "Bloqueado pelo inbox" }),
    });
  }

  if (!conversation) return <div className="p-6 text-sm text-neutral-400">Carregando...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-neutral-200 px-6 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{contactLabel(conversation.contact)}</p>
            <p className="text-xs font-mono text-neutral-400">#{conversation.ticketNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            {TABS.filter((t) => t.key !== conversation.status).map((t) => (
              <button
                key={t.key}
                onClick={() => patchConversation({ status: t.key })}
                className="text-xs rounded-md border border-neutral-300 px-2.5 py-1.5 hover:bg-neutral-50"
              >
                {STATUS_ACTION_LABEL[t.key]}
              </button>
            ))}
            <select
              value={conversation.assignedTo?.id ?? ""}
              onChange={(e) => patchConversation({ assignedToId: e.target.value || null })}
              className="text-xs rounded-md border border-neutral-300 px-2 py-1.5"
            >
              <option value="">Atribuir a...</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button onClick={handleBlock} className="text-xs text-red-600 hover:underline">
              Bloquear
            </button>
          </div>
        </div>
        <TagEditor
          tags={conversation.tags}
          onChange={(tags) => patchConversation({ tags })}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`max-w-md rounded-lg px-3 py-2 text-sm ${
              m.direction === "OUTBOUND"
                ? "self-end bg-accent text-white"
                : "self-start bg-neutral-100 text-neutral-900"
            }`}
          >
            <p>{m.body}</p>
            {m.direction === "OUTBOUND" && m.status !== "SENT" && (
              <p className="text-[10px] opacity-75 mt-1">
                {m.status === "PENDING" ? "enviando..." : m.status === "FAILED" ? "falhou" : m.status}
              </p>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="border-t border-neutral-200 p-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || tags.includes(value)) return;
    onChange([...tags, value]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className="text-[11px] rounded-full bg-accent/10 text-accent pl-2 pr-1 py-0.5 flex items-center gap-1"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="hover:opacity-70" aria-label={`Remover ${tag}`}>
            ×
          </button>
        </span>
      ))}
      <form onSubmit={addTag} className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ tag"
          className="text-[11px] w-16 focus:w-24 transition-all rounded-full border border-neutral-300 px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="text-[11px] text-neutral-500 hover:text-accent px-1"
          aria-label="Adicionar tag"
        >
          adicionar
        </button>
      </form>
    </div>
  );
}
