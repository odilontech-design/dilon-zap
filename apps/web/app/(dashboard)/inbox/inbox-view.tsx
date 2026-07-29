"use client";

import { useState } from "react";
import useSWR from "swr";

type Conversation = {
  id: string;
  status: "OPEN" | "PENDING" | "RESOLVED";
  lastMessageAt: string;
  contact: { id: string; name: string | null; waJid: string };
  messages: { body: string; direction: "INBOUND" | "OUTBOUND" }[];
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  body: string;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function contactLabel(contact: Conversation["contact"]) {
  return contact.name ?? contact.waJid.replace("@s.whatsapp.net", "");
}

export function InboxView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: conversations } = useSWR<Conversation[]>("/api/conversations", fetcher, {
    refreshInterval: 3000,
  });

  return (
    <div className="flex h-screen">
      <div className="w-80 shrink-0 border-r border-neutral-200 overflow-y-auto">
        <h1 className="text-lg font-semibold px-4 py-4 border-b border-neutral-200">Inbox</h1>
        {conversations?.length === 0 && (
          <p className="text-sm text-neutral-500 px-4 py-6">
            Nenhuma conversa ainda. Assim que alguém mandar mensagem pro número conectado, ela
            aparece aqui.
          </p>
        )}
        {conversations?.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 ${
              selectedId === c.id ? "bg-neutral-100" : ""
            }`}
          >
            <p className="text-sm font-medium">{contactLabel(c.contact)}</p>
            <p className="text-xs text-neutral-500 truncate">{c.messages[0]?.body ?? ""}</p>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <ConversationThread conversationId={selectedId} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationThread({ conversationId }: { conversationId: string }) {
  const [draft, setDraft] = useState("");
  const { data: messages, mutate } = useSWR<Message[]>(
    `/api/conversations/${conversationId}/messages`,
    fetcher,
    { refreshInterval: 2000 }
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setDraft("");
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text: draft }),
    });
    mutate();
  }

  return (
    <div className="flex flex-col h-full">
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
