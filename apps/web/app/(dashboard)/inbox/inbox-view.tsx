"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import EmojiPickerReact, { EmojiStyle } from "emoji-picker-react";
import { Avatar } from "@/components/avatar";
import { contactLabel, formatListTimestamp, formatPhoneDisplay, formatTime, type ContactRef } from "@/lib/contact";
import { readableTextColor, tagColor, type TagDef } from "@/lib/tags";
import {
  CONVERSATION_LIST_INTERVAL,
  MESSAGES_INTERVAL,
  STATUS_COUNTS_INTERVAL,
  UNREAD_COUNT_INTERVAL,
} from "@/lib/polling";

type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED";
type MessageStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
type StageDef = { id: string; name: string; color: string };

type ConversationSummary = {
  id: string;
  ticketNumber: number;
  status: ConversationStatus;
  tags: string[];
  contact: ContactRef;
  assignedTo: { id: string; name: string } | null;
  unreadCount: number;
  messages: { body: string; direction: "INBOUND" | "OUTBOUND"; createdAt: string }[];
};

type ConversationDetail = {
  id: string;
  ticketNumber: number;
  status: ConversationStatus;
  tags: string[];
  contact: ContactRef & { stageId: string | null };
  assignedTo: { id: string; name: string } | null;
};

type MediaType = "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO";

type QuotedMessage = {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  mediaType: MediaType | null;
  isDeleted: boolean;
  sender: { name: string } | null;
};

type MessageReaction = { id: string; emoji: string; fromMe: boolean };

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: MessageStatus;
  body: string;
  createdAt: string;
  mediaType: MediaType | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaDurationSeconds: number | null;
  sender: { name: string } | null;
  isEdited: boolean;
  isDeleted: boolean;
  isForwarded: boolean;
  quotedMessage: QuotedMessage | null;
  reactions: MessageReaction[];
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const SENT_STATUSES: MessageStatus[] = ["SENT", "DELIVERED", "READ"];

function quotedLabel(quoted: QuotedMessage, contact: ContactRef) {
  return quoted.direction === "OUTBOUND" ? quoted.sender?.name ?? "Você" : contactLabel(contact);
}

function quotedSnippet(quoted: QuotedMessage) {
  if (quoted.isDeleted) return "Mensagem apagada";
  if (quoted.body) return quoted.body;
  if (quoted.mediaType === "IMAGE") return "📷 Imagem";
  if (quoted.mediaType === "AUDIO") return "🎤 Áudio";
  if (quoted.mediaType === "VIDEO") return "🎥 Vídeo";
  if (quoted.mediaType === "DOCUMENT") return "📄 Documento";
  return "";
}

type TenantUser = { id: string; name: string };

// Lança em resposta não-OK em vez de devolver o corpo de erro como se fosse
// dado válido — sem isso, um { error: "..." } de um 404/400 era tratado como
// se fosse o objeto esperado (ex: a conversa), e a tela quebrava tentando ler
// campos que não existem nesse corpo de erro.
async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `falha ao buscar ${url}`);
  }
  return res.json();
}

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

// Bipe curto gerado na hora via Web Audio — sem precisar de um arquivo de
// áudio externo pra empacotar. Dois tons subindo, parecido com o "pop" do
// WhatsApp.
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [880, 1108].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.16);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // navegador sem suporte a Web Audio, ou bloqueou por falta de interação — sem som mesmo
  }
}

export function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ConversationStatus>("OPEN");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);

  const query = new URLSearchParams({ status: tab });
  if (search.trim()) query.set("search", search.trim());
  if (tagFilter) query.set("tag", tagFilter);
  if (assigneeFilter) query.set("assignedToId", assigneeFilter);
  if (unreadOnly) query.set("unreadOnly", "1");

  const { data: conversations, mutate: mutateList } = useSWR<ConversationSummary[]>(
    `/api/conversations?${query.toString()}`,
    fetcher,
    { refreshInterval: CONVERSATION_LIST_INTERVAL }
  );
  const { data: users } = useSWR<TenantUser[]>("/api/users", fetcher);
  const { data: tagDefs } = useSWR<TagDef[]>("/api/tags", fetcher);
  const { data: statusCounts } = useSWR<Record<ConversationStatus, number>>(
    "/api/conversations/status-counts",
    fetcher,
    { refreshInterval: STATUS_COUNTS_INTERVAL }
  );
  const availableTags = Array.from(new Set((conversations ?? []).flatMap((c) => c.tags))).sort();
  const activeFilterCount = [tagFilter, assigneeFilter, unreadOnly ? "1" : ""].filter(Boolean).length;

  // Contagem global (todas as abas) só pra saber quando tocar o som — uma
  // mensagem nova pode chegar numa conversa que não está na aba aberta agora.
  const { data: unread } = useSWR<{ count: number }>("/api/conversations/unread-count", fetcher, {
    refreshInterval: UNREAD_COUNT_INTERVAL,
  });
  const previousUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (unread === undefined) return;
    if (previousUnreadRef.current !== null && unread.count > previousUnreadRef.current) {
      playNotificationSound();
    }
    previousUnreadRef.current = unread.count;
  }, [unread]);

  // Vindo de "Conversar" na tela de Contatos: abre direto a conversa criada,
  // na aba certa pro status dela, sem precisar procurar na lista.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;

    fetcher(`/api/conversations/${openId}`).then((conversation: ConversationDetail) => {
      if (!conversation?.id) return;
      setTab(conversation.status);
      handleSelectConversation(conversation.id);
    });
    router.replace("/inbox");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira renderização, com o ?open= inicial
  }, []);

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    fetch(`/api/conversations/${id}/read`, { method: "POST" }).then(() => mutateList());
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] md:h-screen">
      <div
        className={`${
          selectedId ? "hidden" : "flex"
        } md:flex w-full md:w-80 shrink-0 border-r border-neutral-200 flex-col`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-200">
          <h1 className="text-lg font-semibold">Inbox</h1>
          <button
            onClick={() => setShowNewConversation(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            + Nova conversa
          </button>
        </div>
        <div className="flex border-b border-neutral-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelectedId(null);
              }}
              className={`flex-1 px-2 py-2 text-xs font-medium border-b-2 flex items-center justify-center gap-1.5 ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
              {!!statusCounts?.[t.key] && (
                <span
                  className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                    tab === t.key ? "bg-accent/15 text-accent" : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {statusCounts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-200">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, número ou mensagem..."
            className="flex-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              showFilters ? "border-accent text-accent" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Filtros
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent text-white text-[9px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-col gap-2 px-3 py-3 border-b border-neutral-200 bg-neutral-50 text-xs">
            <div>
              <label className="block text-[10px] font-medium text-neutral-500 mb-1">Tag</label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
              >
                <option value="">Todas</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-500 mb-1">Atribuído a</label>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
              >
                <option value="">Todos</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-neutral-600">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Só não lidas
            </label>
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setTagFilter("");
                  setAssigneeFilter("");
                  setUnreadOnly(false);
                }}
                className="self-start text-accent hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {conversations?.length === 0 && (
            <p className="text-sm text-neutral-500 px-4 py-6">Nenhuma conversa nessa aba.</p>
          )}
          {conversations?.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectConversation(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 ${
                selectedId === c.id ? "bg-neutral-100" : ""
              }`}
            >
              <div className="flex gap-3">
                <Avatar contact={c.contact} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`text-sm truncate ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                        {contactLabel(c.contact)}
                      </p>
                      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                        #{c.ticketNumber}
                      </span>
                    </div>
                    {c.messages[0] && (
                      <span className="text-[11px] text-neutral-400 shrink-0">
                        {formatListTimestamp(c.messages[0].createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${c.unreadCount > 0 ? "text-neutral-800" : "text-neutral-500"}`}
                    >
                      {c.messages[0]?.body ?? ""}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
                        {c.unreadCount > 9 ? "9+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {c.assignedTo && (
                      <span className="text-[10px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
                        {c.assignedTo.name}
                      </span>
                    )}
                    {c.tags.map((tag) => {
                      const color = tagColor(tagDefs, tag);
                      return (
                        <span
                          key={tag}
                          className="text-[10px] rounded-full px-2 py-0.5"
                          style={{ backgroundColor: color, color: readableTextColor(color) }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className={`${selectedId ? "block" : "hidden"} md:block flex-1 min-w-0`}>
        {selectedId ? (
          <ConversationThread
            conversationId={selectedId}
            onChanged={() => mutateList()}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">
            Selecione uma conversa
          </div>
        )}
      </div>

      {showNewConversation && (
        <NewConversationModal
          onClose={() => setShowNewConversation(false)}
          onStarted={(conversationId) => {
            setShowNewConversation(false);
            setTab("OPEN");
            mutateList();
            handleSelectConversation(conversationId);
          }}
        />
      )}
    </div>
  );
}

function NewConversationModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (conversationId: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const contactRes = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || undefined, phone }),
    });
    if (!contactRes.ok) {
      setSaving(false);
      const body = await contactRes.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "telefone inválido");
      return;
    }
    const contact = await contactRes.json();

    const convRes = await fetch(`/api/contacts/${contact.id}/start-conversation`, { method: "POST" });
    setSaving(false);
    if (!convRes.ok) {
      const body = await convRes.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "não deu pra iniciar a conversa");
      return;
    }
    const conversation = await convRes.json();
    onStarted(conversation.id);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">Nova conversa</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome (opcional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Telefone (com DDD)</label>
            <input
              required
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="21967411481"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Iniciando..." : "Iniciar conversa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConversationThread({
  conversationId,
  onChanged,
  onBack,
}: {
  conversationId: string;
  onChanged: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardBatch, setForwardBatch] = useState<Message[] | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [reactionBarFor, setReactionBarFor] = useState<string | null>(null);
  const [fullReactionPickerFor, setFullReactionPickerFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const {
    data: conversation,
    error: conversationError,
    mutate: mutateConversation,
  } = useSWR<ConversationDetail>(`/api/conversations/${conversationId}`, fetcher);
  const { data: messages, mutate: mutateMessages } = useSWR<Message[]>(
    `/api/conversations/${conversationId}/messages`,
    fetcher,
    { refreshInterval: MESSAGES_INTERVAL }
  );
  const { data: users } = useSWR<TenantUser[]>("/api/users", fetcher);
  const { data: tagDefs } = useSWR<TagDef[]>("/api/tags", fetcher);

  // Ao trocar de conversa, sempre volta a acompanhar o final (igual WhatsApp).
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationId]);

  // Resposta/edição/seleção em andamento não deve "vazar" pra outra conversa
  // que o atendente abra em seguida.
  useEffect(() => {
    setReplyTo(null);
    setEditingMessage(null);
    setSelectionMode(false);
    setSelectedMessageIds([]);
  }, [conversationId]);

  // Rola pro final quando as mensagens chegam (inclui a abertura inicial —
  // messages?.length vai de undefined pra N assim que o SWR resolve) e de
  // novo a cada mensagem nova via polling, mas só se o atendente já estava
  // perto do final (senão puxaria ele pra baixo no meio da leitura de um
  // histórico antigo). Imagem/áudio tem seu próprio gatilho em scrollToBottom
  // via onLoad, porque termina de carregar bem depois desse efeito rodar.
  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollToBottom não precisa disparar o efeito de novo
  }, [conversationId, messages?.length]);

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  async function patchConversation(body: Record<string, unknown>) {
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    mutateConversation();
    onChanged();
  }

  function insertEmoji(emoji: string) {
    const input = draftInputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");

    if (editingMessage) {
      setEditingMessage(null);
      const res = await fetch(`/api/messages/${editingMessage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(typeof body.error === "string" ? body.error : "não deu pra editar a mensagem");
      }
      mutateMessages();
      return;
    }

    setReplyTo(null);
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text, quotedMessageId: replyTo?.id }),
    });
    mutateMessages();
  }

  function handleReply(message: Message) {
    setEditingMessage(null);
    setReplyTo(message);
    draftInputRef.current?.focus();
  }

  function handleEdit(message: Message) {
    setReplyTo(null);
    setEditingMessage(message);
    setDraft(message.body);
    draftInputRef.current?.focus();
  }

  async function handleDelete(message: Message) {
    if (!confirm("Apagar essa mensagem pra todos?")) return;
    if (editingMessage?.id === message.id) setEditingMessage(null);
    const res = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(typeof body.error === "string" ? body.error : "não deu pra apagar a mensagem");
    }
    mutateMessages();
  }

  function handleForward(message: Message) {
    setForwardBatch([message]);
  }

  // Clicar no mesmo emoji que já é a nossa reação atual remove — igual ao
  // app oficial do WhatsApp (não dá pra "somar" duas reações da mesma pessoa).
  async function handleReact(message: Message, emoji: string) {
    setReactionBarFor(null);
    setFullReactionPickerFor(null);
    const mine = message.reactions.find((r) => r.fromMe);
    if (mine?.emoji === emoji) {
      await fetch(`/api/messages/${message.id}/react`, { method: "DELETE" });
    } else {
      await fetch(`/api/messages/${message.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    }
    mutateMessages();
  }

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelectedMessageIds([]);
  }

  function toggleMessageSelected(id: string) {
    setSelectedMessageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openBatchForward() {
    // messages já vem em ordem cronológica (asc) — preserva essa ordem no
    // encaminhamento, independente da ordem em que foram marcadas.
    const batch = (messages ?? []).filter((m) => selectedMessageIds.includes(m.id));
    if (batch.length === 0) return;
    setForwardBatch(batch);
  }

  async function uploadAndSend(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("conversationId", conversationId);
      const uploadRes = await fetch("/api/messages/attachments", { method: "POST", body: form });
      if (!uploadRes.ok) {
        const body = await uploadRes.json();
        alert(typeof body.error === "string" ? body.error : "não deu pra enviar o anexo");
        return;
      }
      const media = await uploadRes.json();
      await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, media }),
      });
      mutateMessages();
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      uploadAndSend(new File([blob], `audio.${ext}`, { type: blob.type }));
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
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

  // Acontece quando a conversa foi atribuída a outra pessoa (ou desatribuída
  // de você) enquanto estava aberta — ela sai da sua visibilidade na hora e
  // o servidor passa a responder 404. Sem esse aviso, a tela quebrava tentando
  // ler os dados de uma conversa que o fetch nem trouxe.
  if (conversationError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-neutral-600">
          Essa conversa não está mais disponível pra você — provavelmente foi atribuída a outra pessoa.
        </p>
        <button onClick={onBack} className="text-sm text-accent hover:underline">
          ← Voltar pra lista
        </button>
      </div>
    );
  }

  if (!conversation) return <div className="p-6 text-sm text-neutral-400">Carregando...</div>;

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="border-b border-neutral-200 px-3 md:px-6 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={onBack}
                aria-label="Voltar para a lista"
                className="md:hidden -ml-1 p-1 text-neutral-500 hover:text-accent"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => setShowContact((v) => !v)}
                className="flex items-center gap-2.5 text-left hover:opacity-70"
              >
                <Avatar contact={conversation.contact} />
                <div>
                  <p className="text-sm font-semibold">{contactLabel(conversation.contact)}</p>
                  <p className="text-xs font-mono text-neutral-400">#{conversation.ticketNumber}</p>
                </div>
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
              <button
                onClick={() => setShowContact((v) => !v)}
                className="text-xs rounded-md border border-neutral-300 px-2.5 py-1.5 hover:bg-neutral-50"
              >
                Ver contato
              </button>
              <button
                onClick={toggleSelectionMode}
                className={`text-xs rounded-md border px-2.5 py-1.5 ${
                  selectionMode ? "border-accent text-accent bg-accent/5" : "border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                {selectionMode ? "Cancelar seleção" : "Selecionar"}
              </button>
              <button onClick={handleBlock} className="text-xs text-red-600 hover:underline">
                Bloquear
              </button>
            </div>
          </div>
          <TagEditor tags={conversation.tags} tagDefs={tagDefs} onChange={(tags) => patchConversation({ tags })} />
        </div>
        {selectionMode && (
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-accent/5 px-3 md:px-6 py-2 text-sm">
            <span className="text-neutral-700">
              {selectedMessageIds.length > 0 ? `${selectedMessageIds.length} selecionada(s)` : "Toque nas mensagens pra selecionar"}
            </span>
            <button
              onClick={openBatchForward}
              disabled={selectedMessageIds.length === 0}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Encaminhar
            </button>
          </div>
        )}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 md:px-6 py-4 flex flex-col gap-2"
          onScroll={handleMessagesScroll}
        >
          {messages?.map((m) => {
            const editable = m.direction === "OUTBOUND" && !m.isDeleted && !m.mediaType && SENT_STATUSES.includes(m.status);
            const deletable = m.direction === "OUTBOUND" && !m.isDeleted;
            const myReaction = m.reactions.find((r) => r.fromMe);
            const theirReaction = m.reactions.find((r) => !r.fromMe);
            const hasReaction = !m.isDeleted && (myReaction || theirReaction);
            return (
              <div
                key={m.id}
                className={`flex items-center gap-2 ${m.direction === "OUTBOUND" ? "self-end" : "self-start"} ${hasReaction ? "mb-2" : ""}`}
              >
                {selectionMode && !m.isDeleted && (
                  <input
                    type="checkbox"
                    checked={selectedMessageIds.includes(m.id)}
                    onChange={() => toggleMessageSelected(m.id)}
                    className="shrink-0"
                  />
                )}
                <div className="relative">
                <div
                  className={`max-w-[85%] md:max-w-md rounded-lg px-3 py-2 text-sm ${
                    m.direction === "OUTBOUND" ? "bg-accent text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                {m.direction === "OUTBOUND" && m.sender && (
                  <p className="text-[10px] font-semibold text-white/75 mb-0.5">{m.sender.name}</p>
                )}
                {m.isDeleted ? (
                  <p className={`italic ${m.direction === "OUTBOUND" ? "text-white/60" : "text-neutral-400"}`}>
                    🚫 Mensagem apagada
                  </p>
                ) : (
                  <>
                    {m.isForwarded && (
                      <p className={`text-[10px] italic flex items-center gap-1 mb-0.5 ${m.direction === "OUTBOUND" ? "text-white/60" : "text-neutral-400"}`}>
                        ↪ Encaminhada
                      </p>
                    )}
                    {m.quotedMessage && (
                      <div
                        className={`mb-1.5 rounded border-l-2 pl-2 py-1 ${
                          m.direction === "OUTBOUND" ? "border-white/50 bg-white/10" : "border-accent/50 bg-black/5"
                        }`}
                      >
                        <p className={`text-xs font-medium ${m.direction === "OUTBOUND" ? "text-white/90" : "text-accent"}`}>
                          {quotedLabel(m.quotedMessage, conversation.contact)}
                        </p>
                        <p className={`text-xs truncate ${m.direction === "OUTBOUND" ? "text-white/70" : "text-neutral-500"}`}>
                          {quotedSnippet(m.quotedMessage)}
                        </p>
                      </div>
                    )}
                    {m.mediaType && <MessageMedia message={m} onLoad={() => scrollToBottom()} />}
                    {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                  </>
                )}
                <div
                  className={`flex items-center justify-between gap-2 mt-1 text-[10px] ${
                    m.direction === "OUTBOUND" ? "text-white/75" : "text-neutral-400"
                  }`}
                >
                  {!m.isDeleted && !selectionMode ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleReply(m)} title="Responder" className="opacity-70 hover:opacity-100">
                        ↩
                      </button>
                      <button
                        onClick={() => setReactionBarFor(reactionBarFor === m.id ? null : m.id)}
                        title="Reagir"
                        className="opacity-70 hover:opacity-100"
                      >
                        😊
                      </button>
                      <button onClick={() => handleForward(m)} title="Encaminhar" className="opacity-70 hover:opacity-100">
                        ↪
                      </button>
                      {editable && (
                        <button onClick={() => handleEdit(m)} title="Editar" className="opacity-70 hover:opacity-100">
                          ✎
                        </button>
                      )}
                      {deletable && (
                        <button onClick={() => handleDelete(m)} title="Apagar" className="opacity-70 hover:opacity-100">
                          🗑
                        </button>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {m.isEdited && !m.isDeleted && <span className="italic">editado</span>}
                    {m.status === "PENDING" ? (
                      <span>enviando...</span>
                    ) : m.status === "FAILED" ? (
                      <span className={m.direction === "OUTBOUND" ? "text-red-100" : "text-red-500"}>falhou</span>
                    ) : (
                      <>
                        <span>{formatTime(m.createdAt)}</span>
                        {m.direction === "OUTBOUND" && <MessageTicks status={m.status} />}
                      </>
                    )}
                  </div>
                </div>
                {hasReaction && (
                  <div
                    className={`absolute -bottom-2.5 flex items-center gap-0.5 ${
                      m.direction === "OUTBOUND" ? "right-1" : "left-1"
                    }`}
                  >
                    {theirReaction && (
                      <span className="rounded-full border border-neutral-200 bg-white shadow-sm text-xs leading-none px-1 py-0.5">
                        {theirReaction.emoji}
                      </span>
                    )}
                    {myReaction && (
                      <span className="rounded-full border border-neutral-200 bg-white shadow-sm text-xs leading-none px-1 py-0.5">
                        {myReaction.emoji}
                      </span>
                    )}
                  </div>
                )}
                {reactionBarFor === m.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setReactionBarFor(null)} />
                    <div
                      className={`absolute bottom-full mb-1 z-20 flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1.5 shadow-lg ${
                        m.direction === "OUTBOUND" ? "right-0" : "left-0"
                      }`}
                    >
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(m, emoji)}
                          className="px-0.5 text-lg leading-none transition-transform hover:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setReactionBarFor(null);
                          setFullReactionPickerFor(m.id);
                        }}
                        title="Mais emojis"
                        className="px-1 text-lg leading-none text-white/70 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                  </>
                )}
                {fullReactionPickerFor === m.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFullReactionPickerFor(null)} />
                    <div className={`absolute bottom-full mb-1 z-20 ${m.direction === "OUTBOUND" ? "right-0" : "left-0"}`}>
                      <EmojiPickerReact
                        onEmojiClick={(data) => handleReact(m, data.emoji)}
                        emojiStyle={EmojiStyle.NATIVE}
                        searchPlaceHolder="Pesquisar"
                        previewConfig={{ showPreview: false }}
                        width={320}
                        height={380}
                        lazyLoadEmojis
                      />
                    </div>
                  </>
                )}
                </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-neutral-200">
          {(replyTo || editingMessage) && (
            <div className="bg-neutral-50 border-b border-neutral-200 px-3 md:px-6 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0 border-l-2 border-accent pl-2">
                <p className="text-xs font-medium text-accent truncate">
                  {editingMessage ? "Editando mensagem" : `Respondendo a ${quotedLabel(
                    {
                      id: replyTo!.id,
                      body: replyTo!.body,
                      direction: replyTo!.direction,
                      mediaType: replyTo!.mediaType,
                      isDeleted: replyTo!.isDeleted,
                      sender: replyTo!.sender,
                    },
                    conversation.contact
                  )}`}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {editingMessage
                    ? editingMessage.body
                    : quotedSnippet({
                        id: replyTo!.id,
                        body: replyTo!.body,
                        direction: replyTo!.direction,
                        mediaType: replyTo!.mediaType,
                        isDeleted: replyTo!.isDeleted,
                        sender: replyTo!.sender,
                      })}
                </p>
              </div>
              <button
                onClick={() => {
                  setReplyTo(null);
                  setEditingMessage(null);
                  setDraft("");
                }}
                aria-label="Cancelar"
                className="text-neutral-400 hover:text-neutral-700 text-lg leading-none shrink-0"
              >
                ×
              </button>
            </div>
          )}
          <form onSubmit={handleSend} className="relative p-2.5 md:p-4 flex gap-1.5 md:gap-2 items-center">
            {showEmoji && (
              <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAndSend(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              disabled={uploading || recording}
              title="Emoji"
              className="text-lg text-neutral-500 hover:text-accent disabled:opacity-40 px-1"
            >
              😊
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording || !!editingMessage}
              title="Anexar imagem, áudio ou arquivo"
              className="text-lg text-neutral-500 hover:text-accent disabled:opacity-40 px-1"
            >
              📎
            </button>
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={uploading || !!editingMessage}
              title={recording ? "Parar gravação" : "Gravar áudio"}
              className={`text-lg px-1 disabled:opacity-40 ${recording ? "text-red-600" : "text-neutral-500 hover:text-accent"}`}
            >
              {recording ? "⏹" : "🎤"}
            </button>
            <input
              ref={draftInputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={uploading ? "Enviando anexo..." : recording ? "Gravando áudio..." : "Escreva uma mensagem..."}
              disabled={uploading || recording}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-100"
            />
            <button
              type="submit"
              disabled={uploading || recording}
              className="rounded-md bg-accent px-3 md:px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {editingMessage ? "Salvar" : "Enviar"}
            </button>
          </form>
        </div>
      </div>
      {showContact && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setShowContact(false)}
            aria-hidden
          />
          <ContactPanel
            contact={conversation.contact}
            onClose={() => setShowContact(false)}
            onSaved={() => {
              mutateConversation();
              onChanged();
            }}
          />
        </>
      )}
      {forwardBatch && (
        <ForwardModal
          messages={forwardBatch}
          onClose={() => setForwardBatch(null)}
          onForwarded={() => {
            setForwardBatch(null);
            setSelectionMode(false);
            setSelectedMessageIds([]);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

type ForwardTarget = {
  id: string;
  ticketNumber: number;
  contact: ContactRef;
};

function ForwardModal({
  messages,
  onClose,
  onForwarded,
}: {
  messages: Message[];
  onClose: () => void;
  onForwarded: () => void;
}) {
  const { data: targets } = useSWR<ForwardTarget[]>("/api/conversations/forward-targets", fetcher);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = (targets ?? []).filter((t) =>
    contactLabel(t.contact).toLowerCase().includes(search.trim().toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Manda cada mensagem em sequência (não em paralelo) pra chegar na
  // conversa de destino na mesma ordem cronológica em que foram selecionadas.
  async function handleForward() {
    if (selected.length === 0) return;
    setSending(true);
    setError(null);
    for (const message of messages) {
      const res = await fetch(`/api/messages/${message.id}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSending(false);
        setError(typeof body.error === "string" ? body.error : "não deu pra encaminhar");
        return;
      }
    }
    setSending(false);
    onForwarded();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm shadow-lg flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-neutral-200">
          <h2 className="text-base font-semibold mb-1">Encaminhar mensagem</h2>
          <p className="text-xs text-neutral-500 truncate">
            {messages.length > 1
              ? `${messages.length} mensagens selecionadas`
              : messages[0].mediaType
                ? messages[0].mediaType === "IMAGE"
                  ? "📷 Imagem"
                  : messages[0].mediaType === "AUDIO"
                    ? "🎤 Áudio"
                    : messages[0].mediaType === "VIDEO"
                      ? "🎥 Vídeo"
                      : "📄 Documento"
                : messages[0].body}
          </p>
        </div>
        <div className="p-3 border-b border-neutral-200">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contato..."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-sm text-neutral-400 px-4 py-6">Nenhum contato encontrado.</p>
          )}
          {filtered.map((t) => (
            <label key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={() => toggle(t.id)}
                className="shrink-0"
              />
              <Avatar contact={t.contact} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{contactLabel(t.contact)}</p>
                <p className="text-[10px] font-mono text-neutral-400">#{t.ticketNumber}</p>
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 px-4 pt-2">{error}</p>}
        <div className="flex justify-end gap-2 p-4 border-t border-neutral-200">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button
            onClick={handleForward}
            disabled={selected.length === 0 || sending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Encaminhando..." : `Encaminhar${selected.length > 0 ? ` (${selected.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-full left-4 mb-2 z-20">
        <EmojiPickerReact
          onEmojiClick={(data) => onPick(data.emoji)}
          emojiStyle={EmojiStyle.NATIVE}
          searchPlaceHolder="Pesquisar"
          previewConfig={{ showPreview: false }}
          width={320}
          height={380}
          lazyLoadEmojis
        />
      </div>
    </>
  );
}

function MessageMedia({ message, onLoad }: { message: Message; onLoad?: () => void }) {
  const src = `/api/messages/${message.id}/media`;

  if (message.mediaType === "AUDIO") {
    return (
      <audio controls preload="none" src={src} className="max-w-full mb-1" style={{ height: 36 }}>
        Seu navegador não suporta áudio.
      </audio>
    );
  }

  if (message.mediaType === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- vem via redirect assinado do R2, sem domínio fixo
      <img src={src} alt={message.body || "imagem"} className="max-w-full rounded-md mb-1" onLoad={onLoad} />
    );
  }

  if (message.mediaType === "VIDEO") {
    return (
      <video controls preload="metadata" src={src} className="max-w-full rounded-md mb-1" style={{ maxHeight: 320 }} onLoadedData={onLoad}>
        Seu navegador não suporta vídeo.
      </video>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-current/20 px-2.5 py-2 mb-1 text-sm hover:opacity-80"
    >
      📄 {message.mediaFileName ?? "arquivo"}
    </a>
  );
}

function MessageTicks({ status }: { status: MessageStatus }) {
  if (status === "SENT") return <span aria-label="Enviada">✓</span>;
  if (status === "DELIVERED") return <span aria-label="Entregue">✓✓</span>;
  if (status === "READ") return <span className="text-sky-300" aria-label="Lida">✓✓</span>;
  return null;
}

function ContactPanel({
  contact,
  onClose,
  onSaved,
}: {
  contact: ContactRef & { stageId: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: stages } = useSWR<StageDef[]>("/api/stages", fetcher);
  const [name, setName] = useState(contact.name ?? "");

  async function save(body: Record<string, unknown>) {
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-72 md:static md:z-auto shrink-0 border-l border-neutral-200 bg-white p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Contato</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Fechar">
          ×
        </button>
      </div>
      <div className="flex justify-center">
        <Avatar contact={contact} size={72} />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== (contact.name ?? "") && save({ name: name.trim() || null })}
          placeholder={formatPhoneDisplay(contact)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Telefone</label>
        <p className="text-sm text-neutral-600">{formatPhoneDisplay(contact)}</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Etapa</label>
        <select
          value={contact.stageId ?? ""}
          onChange={(e) => save({ stageId: e.target.value || null })}
          className="w-full text-sm rounded-md border border-neutral-300 px-2 py-1.5"
        >
          <option value="">Sem etapa</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TagEditor({
  tags,
  tagDefs,
  onChange,
}: {
  tags: string[];
  tagDefs: TagDef[] | undefined;
  onChange: (tags: string[]) => void;
}) {
  function addTag(name: string) {
    if (!name || tags.includes(name)) return;
    onChange([...tags, name]);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  // Só etiquetas ativas e ainda não aplicadas aparecem pra escolher — igual
  // JetSales, quem cria/gerencia a lista é a página Etiquetas, não digitando
  // aqui. Uma tag já aplicada que não bate com nenhuma cadastrada (texto
  // livre de antes desse cadastro existir) continua aparecendo normal, só
  // com a cor neutra de fallback.
  const options = (tagDefs ?? []).filter((t) => t.isActive && !tags.includes(t.name));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => {
        const color = tagColor(tagDefs, tag);
        return (
          <span
            key={tag}
            className="text-[11px] rounded-full pl-2 pr-1 py-0.5 flex items-center gap-1"
            style={{ backgroundColor: color, color: readableTextColor(color) }}
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:opacity-70" aria-label={`Remover ${tag}`}>
              ×
            </button>
          </span>
        );
      })}
      {options.length > 0 && (
        <select
          value=""
          onChange={(e) => addTag(e.target.value)}
          className="text-[11px] rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-neutral-500 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="" disabled>
            + etiqueta
          </option>
          {options.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
