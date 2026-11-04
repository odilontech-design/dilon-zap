"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { rotuloDeData } from "@/lib/rotulo-data";
import { rolarParaOFim } from "@/lib/rolagem";
import useSWR from "swr";
import { MESSAGES_INTERVAL, LISTING_INTERVAL } from "@/lib/polling";
import { EmojiPicker, SavedTextPicker } from "../inbox/inbox-view";
import { TextoWhatsApp } from "@/components/texto-whatsapp";

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
type Pessoa = { id: string; name: string; suporte?: boolean };

// O que está aberto: um canal (Geral ou de setor) ou uma conversa direta.
type Selecao = { tipo: "canal"; setorId: string | null } | { tipo: "pessoa"; id: string; nome: string };

type Mensagem = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string };
  mediaType: "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO" | null;
  mediaFileName: string | null;
  isDeleted: boolean;
  createdAt: string;
  /** Só nas minhas mensagens: quem já viu (nomes). */
  vistoPor?: string[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Busca as mensagens marcando o canal como lido SÓ quando a aba está à
 * vista — é o que acende o "Vista" para quem escreveu. Um chat aberto e
 * esquecido em segundo plano não pode confirmar leitura de ninguém.
 */
const fetcherMensagens = (url: string) => {
  const visivel = typeof document !== "undefined" && document.visibilityState === "visible";
  return fetch(visivel ? `${url}${url.includes("?") ? "&" : "?"}marcar=1` : url).then((r) => r.json());
};

export function TeamChatPanel({ meuId }: { meuId: string }) {
  const { data: canais } = useSWR<Canal[]>("/api/team-chat/channels", fetcher, {
    refreshInterval: LISTING_INTERVAL,
  });
  // Todo colega ativo da empresa, de qualquer setor — o ponto da conversa
  // direta é justamente falar com quem está em outro setor.
  // Mensagens novas por canal e por pessoa. O canal aberto zera sozinho,
  // porque abrir/consultar marca como lido no servidor.
  const { data: naoLidas } = useSWR<{ total: number; porCanal: Record<string, number> }>(
    "/api/team-chat/nao-lidas",
    fetcher,
    { refreshInterval: 10_000 }
  );
  const selo = (canal: string) => {
    const n = naoLidas?.porCanal?.[canal] ?? 0;
    return n > 0 ? (
      <span className="ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-accent text-white">{n > 99 ? "99+" : n}</span>
    ) : null;
  };
  const { data: pessoas } = useSWR<Pessoa[]>("/api/team-chat/people", fetcher, {
    refreshInterval: LISTING_INTERVAL,
  });
  const [selecao, setSelecao] = useState<Selecao | undefined>(undefined);
  // No celular não cabem as duas colunas: mostra a lista ou a conversa. O
  // Geral é escolhido sozinho ao abrir, mas só aparece quando a pessoa toca.
  const [conversaAberta, setConversaAberta] = useState(false);
  const abrir = (s: Selecao) => {
    setSelecao(s);
    setConversaAberta(true);
  };

  // Geral assim que os canais chegam, se ainda não tiver nada escolhido —
  // abrir o chat sem nenhuma conversa selecionada deixaria a tela vazia à
  // toa na primeira visita.
  useEffect(() => {
    if (canais && selecao === undefined) setSelecao({ tipo: "canal", setorId: null });
  }, [canais, selecao]);

  return (
    <div className="flex h-[calc(100dvh-3rem)] md:h-screen">
      <div className={`${conversaAberta ? "hidden md:flex" : "flex"} w-full md:w-72 shrink-0 border-r border-neutral-200 flex-col`}>
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
                onClick={() => abrir({ tipo: "canal", setorId: c.setorId })}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-neutral-100 hover:bg-neutral-50 ${
                  selecao?.tipo === "canal" && selecao.setorId === c.setorId ? "bg-accent/10" : ""
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: c.cor ?? "#6B7280" }}
                />
                <span className="text-sm font-medium text-neutral-900">{c.nome}</span>
                {!(selecao?.tipo === "canal" && selecao.setorId === c.setorId) && selo(c.setorId ? `setor:${c.setorId}` : "geral")}
              </button>
            ))
          )}

          <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Conversas diretas
          </p>
          {!pessoas ? (
            <p className="px-4 py-2 text-sm text-neutral-400">Carregando...</p>
          ) : pessoas.length === 0 ? (
            <p className="px-4 py-2 text-sm text-neutral-400">Você é o único usuário ativo.</p>
          ) : (
            pessoas.map((pe) => (
              <button
                key={pe.id}
                onClick={() => abrir({ tipo: "pessoa", id: pe.id, nome: pe.name })}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-neutral-100 hover:bg-neutral-50 ${
                  selecao?.tipo === "pessoa" && selecao.id === pe.id ? "bg-accent/10" : ""
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-medium flex items-center justify-center shrink-0">
                  {pe.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-neutral-900 truncate">{pe.name}</span>
                {!(selecao?.tipo === "pessoa" && selecao.id === pe.id) && selo(`dm:${pe.id}`)}
              </button>
            ))
          )}
        </div>
      </div>

      {selecao === undefined ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-neutral-400">
          Carregando...
        </div>
      ) : (
        <div className={`${conversaAberta ? "flex" : "hidden md:flex"} flex-1 min-w-0`}>
        <CanalAberto
          onVoltar={() => setConversaAberta(false)}
          key={selecao.tipo === "pessoa" ? `pessoa-${selecao.id}` : (selecao.setorId ?? "geral")}
          setorId={selecao.tipo === "canal" ? selecao.setorId : null}
          destinatarioId={selecao.tipo === "pessoa" ? selecao.id : null}
          nomeCanal={
            selecao.tipo === "pessoa"
              ? selecao.nome
              : (canais?.find((c) => c.setorId === selecao.setorId)?.nome ?? "")
          }
          meuId={meuId}
          comSuporte={!!pessoas?.some((p) => p.suporte)}
          conversaComSuporte={selecao.tipo === "pessoa" && !!pessoas?.find((p) => p.id === selecao.id)?.suporte}
        />
        </div>
      )}
    </div>
  );
}

function CanalAberto({
  setorId,
  destinatarioId,
  nomeCanal,
  meuId,
  comSuporte,
  conversaComSuporte,
  onVoltar,
}: {
  setorId: string | null;
  /** Preenchido = conversa direta com esta pessoa (setorId vem null). */
  destinatarioId: string | null;
  nomeCanal: string;
  meuId: string;
  /** A empresa conversa com o suporte da Dilon Tech (que também participa do Geral). */
  comSuporte: boolean;
  conversaComSuporte: boolean;
  /** Celular: volta para a lista de canais. */
  onVoltar: () => void;
}) {
  const query = destinatarioId ? `?com=${destinatarioId}` : setorId ? `?setorId=${setorId}` : "";
  const { data: mensagens, mutate } = useSWR<Mensagem[]>(`/api/team-chat/messages${query}`, fetcherMensagens, {
    refreshInterval: MESSAGES_INTERVAL,
  });
  const [draft, setDraft] = useState("");
  const [mostrarEmoji, setMostrarEmoji] = useState(false);
  const [mostrarTextos, setMostrarTextos] = useState(false);
  const [gravando, setGravando] = useState(false);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [anexoPendente, setAnexoPendente] = useState<{ file: File; url: string; ehImagem: boolean } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A caixa, não a página: scrollIntoView fazia a tela subir no celular.
    rolarParaOFim(fimRef.current?.parentElement ?? null);
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
      body: JSON.stringify({ setorId, destinatarioId, text: texto }),
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
      if (destinatarioId) form.append("destinatarioId", destinatarioId);
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
        body: JSON.stringify({ setorId, destinatarioId, text: legenda.trim() || undefined, media }),
      });
      mutate();
    } finally {
      setEnviando(false);
    }
  }

  /** Insere no ponto do cursor (emoji, texto pronto). */
  function inserir(trecho: string) {
    const campo = campoRef.current;
    const ini = campo?.selectionStart ?? draft.length;
    const fim = campo?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, ini) + trecho + draft.slice(fim));
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(ini + trecho.length, ini + trecho.length);
    });
  }

  // Enter envia, Shift+Enter quebra a linha — igual ao Inbox. No celular
  // (toque) o Enter quebra a linha e o envio é pelo botão.
  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  async function gravarAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream);
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      gravador.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || "audio/webm" });
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        // Abre a prévia (com player) em vez de mandar direto: dá pra ouvir e descartar.
        abrirPrevia(new File([blob], `audio.${ext}`, { type: blob.type }));
      };
      gravador.start();
      gravadorRef.current = gravador;
      setGravando(true);
    } catch {
      alert("Não deu pra usar o microfone. Libere o acesso ao microfone no navegador.");
    }
  }

  function pararAudio() {
    gravadorRef.current?.stop();
    setGravando(false);
  }

  function abrirPrevia(file: File) {
    setAnexoPendente({ file, url: URL.createObjectURL(file), ehImagem: file.type.startsWith("image/") });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const extensao = file.type.split("/")[1] || "png";
    abrirPrevia(new File([file], `print.${extensao}`, { type: file.type }));
  }

  async function apagar(id: string) {
    if (!confirm("Apagar essa mensagem?")) return;
    await fetch(`/api/team-chat/messages/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <button onClick={onVoltar} className="md:hidden -ml-1 px-1 text-neutral-500 hover:text-neutral-800 text-lg leading-none" aria-label="Voltar para a lista">
            ←
          </button>
          <h2 className="text-sm font-semibold text-neutral-900">{nomeCanal}</h2>
        </div>
        {destinatarioId && (
          <p className="text-xs text-neutral-500">
            {conversaComSuporte
              ? "Fale com a equipe da Dilon Tech. Conversa privada — só vocês dois veem."
              : "Conversa privada — só vocês dois veem."}
          </p>
        )}
        {!destinatarioId && !setorId && comSuporte && (
          <p className="text-xs text-neutral-500">A equipe de suporte da Dilon Tech também participa deste canal.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {!mensagens ? (
          <p className="text-sm text-neutral-400">Carregando...</p>
        ) : mensagens.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma mensagem ainda — comece a conversa.</p>
        ) : (
          mensagens.map((m, i) => {
            const minha = m.authorId === meuId;
            // Faixa de data quando o dia muda (reunião Believe, 29/10): só a
            // hora não dizia de que dia era a conversa.
            const novoDia = i === 0 || new Date(mensagens[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <Fragment key={m.id}>
              {novoDia && (
                <div className="self-center my-1 rounded-md bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-600">{rotuloDeData(m.createdAt)}</div>
              )}
              <div className={`flex ${minha ? "justify-end" : "justify-start"}`}>
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
                      {m.mediaType === "IMAGE" ? (
                        <a href={`/api/team-chat/messages/${m.id}/media`} target="_blank" rel="noopener noreferrer" className="block mb-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/team-chat/messages/${m.id}/media`}
                            alt={m.mediaFileName ?? "imagem"}
                            className="max-h-60 max-w-full rounded-md object-contain"
                          />
                        </a>
                      ) : m.mediaType === "AUDIO" ? (
                        <audio controls preload="none" src={`/api/team-chat/messages/${m.id}/media`} className="max-w-full mb-1" style={{ height: 36 }} />
                      ) : m.mediaType === "VIDEO" ? (
                        <video controls preload="metadata" src={`/api/team-chat/messages/${m.id}/media`} className="max-h-60 max-w-full rounded-md mb-1" />
                      ) : m.mediaType ? (
                        <a
                          href={`/api/team-chat/messages/${m.id}/media`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block mb-1 text-sm underline ${minha ? "text-white" : "text-accent"}`}
                        >
                          📎 {m.mediaFileName || "anexo"}
                        </a>
                      ) : null}
                      {m.body && (
                        <p className="text-sm whitespace-pre-wrap break-words">
                          <TextoWhatsApp texto={m.body} />
                        </p>
                      )}
                    </>
                  )}
                  <p className={`text-[11px] mt-1 flex items-center gap-1.5 ${minha ? "text-white/70 justify-end" : "text-neutral-400"}`}>
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {/* Visto: na conversa direta, se a pessoa leu; no canal,
                        quantos leram — os nomes aparecem ao passar o mouse. */}
                    {minha && !m.isDeleted && m.vistoPor && (
                      <span
                        title={m.vistoPor.length ? `Vista por: ${m.vistoPor.join(", ")}` : "Ainda não vista"}
                        className={m.vistoPor.length ? "text-white font-medium" : ""}
                      >
                        {m.vistoPor.length === 0
                          ? "✓ Enviada"
                          : destinatarioId
                            ? "✓✓ Vista"
                            : `✓✓ Vista por ${m.vistoPor.length}`}
                      </span>
                    )}
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
              </Fragment>
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
        <div className="relative flex items-center gap-1">
          {mostrarEmoji && (
            <EmojiPicker
              onPick={(emoji) => inserir(emoji)}
              onClose={() => setMostrarEmoji(false)}
            />
          )}
          {mostrarTextos && (
            <SavedTextPicker
              onPick={(corpo) => {
                inserir(corpo);
                setMostrarTextos(false);
              }}
              onClose={() => setMostrarTextos(false)}
            />
          )}
          <button type="button" onClick={() => setMostrarEmoji((v) => !v)} title="Emoji" className="text-lg px-1 hover:opacity-80">
            😊
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={enviando}
            title="Anexar imagem ou arquivo"
            className="text-lg text-neutral-500 hover:text-accent disabled:opacity-40 px-1"
          >
            📎
          </button>
          <button type="button" onClick={() => setMostrarTextos((v) => !v)} title="Textos prontos" className="text-lg px-1 hover:opacity-80">
            ⚡
          </button>
          <button
            type="button"
            onClick={gravando ? pararAudio : gravarAudio}
            disabled={enviando}
            title={gravando ? "Parar gravação (você ouve antes de enviar)" : "Gravar áudio"}
            className={`text-lg px-1 disabled:opacity-40 ${gravando ? "text-red-600 animate-pulse" : "hover:opacity-80"}`}
          >
            {gravando ? "⏹" : "🎤"}
          </button>
        </div>
        <textarea
          ref={campoRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={aoTeclar}
          onPaste={handlePaste}
          disabled={enviando}
          placeholder={gravando ? "Gravando áudio... clique em ⏹ para parar e ouvir" : `Escreva pra ${nomeCanal}...`}
          className="flex-1 resize-y max-h-40 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-100"
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
          <h2 className="text-sm font-semibold">{anexo.file.type.startsWith("audio/") ? "Ouvir e enviar áudio" : "Enviar anexo"}</h2>
          <button onClick={onCancelar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex items-center justify-center bg-neutral-50 p-4">
          {anexo.ehImagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local, vem de um blob: URL
            <img src={anexo.url} alt="Prévia" className="max-h-[50vh] max-w-full rounded-md object-contain" />
          ) : anexo.file.type.startsWith("audio/") ? (
            <audio controls src={anexo.url} className="w-full" />
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
