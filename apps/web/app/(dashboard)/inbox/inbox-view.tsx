"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import EmojiPickerReact, { EmojiStyle } from "emoji-picker-react";
import { Avatar } from "@/components/avatar";
import {
  contactLabel,
  formatPhoneDisplay,
  formatTime,
  PIPELINE_STAGES,
  type ContactRef,
  type PipelineStage,
} from "@/lib/contact";

type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED";
type MessageStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

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
  contact: ContactRef & { pipelineStage: PipelineStage };
  assignedTo: { id: string; name: string } | null;
};

type MediaType = "AUDIO" | "IMAGE" | "DOCUMENT";

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
  const { data: conversations, mutate: mutateList } = useSWR<ConversationSummary[]>(
    `/api/conversations?status=${tab}`,
    fetcher,
    { refreshInterval: 3000 }
  );

  // Contagem global (todas as abas) só pra saber quando tocar o som — uma
  // mensagem nova pode chegar numa conversa que não está na aba aberta agora.
  const { data: unread } = useSWR<{ count: number }>("/api/conversations/unread-count", fetcher, {
    refreshInterval: 4000,
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
                        {formatTime(c.messages[0].createdAt)}
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
                    {c.tags.map((tag) => (
                      <span key={tag} className="text-[10px] rounded-full bg-accent/10 text-accent px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
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
  const [showContact, setShowContact] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
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
    setDraft("");
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text: draft }),
    });
    mutateMessages();
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

  if (!conversation) return <div className="p-6 text-sm text-neutral-400">Carregando...</div>;

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="border-b border-neutral-200 px-6 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
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
              <button
                onClick={() => setShowContact((v) => !v)}
                className="text-xs rounded-md border border-neutral-300 px-2.5 py-1.5 hover:bg-neutral-50"
              >
                Ver contato
              </button>
              <button onClick={handleBlock} className="text-xs text-red-600 hover:underline">
                Bloquear
              </button>
            </div>
          </div>
          <TagEditor tags={conversation.tags} onChange={(tags) => patchConversation({ tags })} />
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
              {m.mediaType && <MessageMedia message={m} />}
              {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
              <div
                className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${
                  m.direction === "OUTBOUND" ? "text-white/75" : "text-neutral-400"
                }`}
              >
                {m.status === "PENDING" ? (
                  <span>enviando...</span>
                ) : m.status === "FAILED" ? (
                  <span className={m.direction === "OUTBOUND" ? "text-red-100" : "text-red-500"}>
                    falhou
                  </span>
                ) : (
                  <>
                    <span>{formatTime(m.createdAt)}</span>
                    {m.direction === "OUTBOUND" && <MessageTicks status={m.status} />}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSend} className="relative border-t border-neutral-200 p-4 flex gap-2 items-center">
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
            disabled={uploading || recording}
            title="Anexar imagem, áudio ou arquivo"
            className="text-lg text-neutral-500 hover:text-accent disabled:opacity-40 px-1"
          >
            📎
          </button>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
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
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      </div>
      {showContact && (
        <ContactPanel
          contact={conversation.contact}
          onClose={() => setShowContact(false)}
          onSaved={() => {
            mutateConversation();
            onChanged();
          }}
        />
      )}
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

function MessageMedia({ message }: { message: Message }) {
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
      <img src={src} alt={message.body || "imagem"} className="max-w-full rounded-md mb-1" />
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
  contact: ContactRef & { pipelineStage: PipelineStage };
  onClose: () => void;
  onSaved: () => void;
}) {
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
    <div className="w-72 shrink-0 border-l border-neutral-200 bg-white p-4 flex flex-col gap-4">
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
        <label className="block text-xs font-medium text-neutral-700 mb-1">Status do lead</label>
        <select
          value={contact.pipelineStage}
          onChange={(e) => save({ pipelineStage: e.target.value })}
          className="w-full text-sm rounded-md border border-neutral-300 px-2 py-1.5"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
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
