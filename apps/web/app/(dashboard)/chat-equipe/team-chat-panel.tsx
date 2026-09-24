"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { MESSAGES_INTERVAL, LISTING_INTERVAL } from "@/lib/polling";

/**
 * Chat interno da equipe. Um canal É um Setor (ver lib/team-chat.ts) — Geral
 * é o único que não corresponde a nenhum, por isso setorId vem null pra ele
 * tanto aqui quanto na API.
 *
 * Layout de duas colunas como o Inbox, mas bem mais simples de propósito:
 * sem status, sem responsável, sem etiqueta, sem citação — é conversa de
 * equipe, não atendimento a cliente.
 */

type Canal = { setorId: string | null; nome: string; cor: string | null };

type Mensagem = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string };
  mediaType: "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO" | null;
  mediaFileName: string | null;
  isDeleted: boolean;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TeamChatPanel({ meuId }: { meuId: string }) {
  const { data: canais } = useSWR<Canal[]>("/api/team-chat/channels", fetcher, {
    refreshInterval: LISTING_INTERVAL,
  });
  const [canalSelecionado, setCanalSelecionado] = useState<string | null | undefined>(undefined);

  // Geral assim que os canais chegam, se ainda não tiver nada escolhido —
  // abrir o chat sem nenhuma conversa selecionada deixaria a tela vazia à
  // toa na primeira visita.
  useEffect(() => {
    if (canais && canalSelecionado === undefined) setCanalSelecionado(null);
  }, [canais, canalSelecionado]);

  return (
    <div className="flex h-[calc(100dvh-3rem)] md:h-screen">
      <div className="w-full md:w-72 shrink-0 border-r border-neutral-200 flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <h1 className="text-lg font-semibold">Chat da equipe</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Conversa interna — não vai pro WhatsApp do cliente.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!canais ? (
            <p className="p-4 text-sm text-neutral-400">Carregando...</p>
          ) : (
            canais.map((c) => (
              <button
                key={c.setorId ?? "geral"}
                onClick={() => setCanalSelecionado(c.setorId)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-neutral-100 hover:bg-neutral-50 ${
                  canalSelecionado === c.setorId ? "bg-accent/10" : ""
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: c.cor ?? "#6B7280" }}
                />
                <span className="text-sm font-medium text-neutral-900">{c.nome}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {canalSelecionado === undefined ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-neutral-400">
          Carregando...
        </div>
      ) : (
        <CanalAberto
          key={canalSelecionado ?? "geral"}
          setorId={canalSelecionado}
          nomeCanal={canais?.find((c) => c.setorId === canalSelecionado)?.nome ?? ""}
          meuId={meuId}
        />
      )}
    </div>
  );
}

function CanalAberto({
  setorId,
  nomeCanal,
  meuId,
}: {
  setorId: string | null;
  nomeCanal: string;
  meuId: string;
}) {
  const query = setorId ? `?setorId=${setorId}` : "";
  const { data: mensagens, mutate } = useSWR<Mensagem[]>(`/api/team-chat/messages${query}`, fetcher, {
    refreshInterval: MESSAGES_INTERVAL,
  });
  const [draft, setDraft] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexoPendente, setAnexoPendente] = useState<{ file: File; url: string; ehImagem: boolean } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "auto" });
  }, [mensagens?.length]);

  async function enviarTexto(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const texto = draft;
    setDraft("");
    setEnviando(true);
    await fetch("/api/team-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setorId, text: texto }),
    });
    setEnviando(false);
    mutate();
  }

  async function enviarAnexo(file: File, legenda: string) {
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (setorId) form.append("setorId", setorId);
      const uploadRes = await fetch("/api/team-chat/attachments", { method: "POST", body: form });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        alert(typeof body.error === "string" ? body.error : "não deu pra enviar o anexo");
        return;
      }
      const media = await uploadRes.json();
      await fetch("/api/team-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setorId, text: legenda.trim() || undefined, media }),
      });
      mutate();
    } finally {
      setEnviando(false);
    }
  }

  function abrirPrevia(file: File) {
    setAnexoPendente({ file, url: URL.createObjectURL(file), ehImagem: file.type.startsWith("image/") });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const extensao = file.type.split("/")[1] || "png";
    abrirPrevia(new File([file], `print.${extensao}`, { type: file.type }));
  }

  async function apagar(id: string) {
    if (!confirm("Apagar essa mensagem pra todo mundo do canal?")) return;
    await fetch(`/api/team-chat/messages/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="p-4 border-b border-neutral-200">
        <h2 className="text-sm font-semibold text-neutral-900">{nomeCanal}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {!mensagens ? (
          <p className="text-sm text-neutral-400">Carregando...</p>
        ) : mensagens.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma mensagem ainda — comece a conversa.</p>
        ) : (
          mensagens.map((m) => {
            const minha = m.authorId === meuId;
            return (
              <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 group relative ${
                    minha ? "bg-accent text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                  {!minha && <p className="text-xs font-semibold mb-0.5 opacity-80">{m.author.name}</p>}
                  {m.isDeleted ? (
                    <p className={`text-sm italic ${minha ? "text-white/70" : "text-neutral-400"}`}>
                      mensagem apagada
                    </p>
                  ) : (
                    <>
                      {m.mediaType && (
                        <a
                          href={`/api/team-chat/messages/${m.id}/media`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block mb-1 text-sm underline ${minha ? "text-white" : "text-accent"}`}
                        >
                          {m.mediaType === "IMAGE" ? "🖼" : m.mediaType === "VIDEO" ? "🎞" : "📎"}{" "}
                          {m.mediaFileName || "anexo"}
                        </a>
                      )}
                      {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                  <p className={`text-[11px] mt-1 ${minha ? "text-white/70" : "text-neutral-400"}`}>
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {minha && !m.isDeleted && (
                    <button
                      onClick={() => apagar(m.id)}
                      title="Apagar"
                      className="hidden group-hover:block absolute -left-6 top-1.5 text-neutral-400 hover:text-red-600 text-xs"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={fimRef} />
      </div>

      <form onSubmit={enviarTexto} className="p-3 border-t border-neutral-200 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) abrirPrevia(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={enviando}
          title="Anexar imagem ou arquivo"
          className="text-lg text-neutral-500 hover:text-accent disabled:opacity-40 px-1"
        >
          📎
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          disabled={enviando}
          placeholder={`Escreva pra ${nomeCanal}...`}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-100"
        />
        <button
          type="submit"
          disabled={enviando || !draft.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>

      {anexoPendente && (
        <PreviaDeAnexo
          anexo={anexoPendente}
          enviando={enviando}
          onCancelar={() => {
            URL.revokeObjectURL(anexoPendente.url);
            setAnexoPendente(null);
          }}
          onEnviar={async (legenda) => {
            const { file, url } = anexoPendente;
            setAnexoPendente(null);
            URL.revokeObjectURL(url);
            await enviarAnexo(file, legenda);
          }}
        />
      )}
    </div>
  );
}

/** Mesma ideia da prévia do Inbox (ver inbox-view.tsx) — cópia pequena e
 * independente porque a do Inbox arrasta consigo bloqueio de WhatsApp,
 * agendamento e outras coisas que não existem aqui dentro. */
function PreviaDeAnexo({
  anexo,
  enviando,
  onCancelar,
  onEnviar,
}: {
  anexo: { file: File; url: string; ehImagem: boolean };
  enviando: boolean;
  onCancelar: () => void;
  onEnviar: (legenda: string) => void;
}) {
  const [legenda, setLegenda] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg w-full max-w-md shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <h2 className="text-sm font-semibold">Enviar anexo</h2>
          <button onClick={onCancelar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex items-center justify-center bg-neutral-50 p-4">
          {anexo.ehImagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local, vem de um blob: URL
            <img src={anexo.url} alt="Prévia" className="max-h-[50vh] max-w-full rounded-md object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-neutral-500">
              <span className="text-4xl">📎</span>
              <span className="text-sm text-center break-all px-4">{anexo.file.name}</span>
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onEnviar(legenda);
          }}
          className="flex items-center gap-2 p-3 border-t border-neutral-200"
        >
          <input
            autoFocus
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
            placeholder="Adicionar legenda..."
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
