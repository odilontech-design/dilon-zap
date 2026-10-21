"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { LISTING_INTERVAL, MESSAGES_INTERVAL } from "@/lib/polling";

type Conversa = { tenantId: string; empresa: string; userId: string; nome: string; ultima: string; deSuporte: boolean; em: string; naoLidas: number };
type Empresa = { id: string; name: string; usuarios: { id: string; name: string }[]; geralEm: string | null; geralNaoLidas: number };
type Caixa = { conversas: Conversa[]; empresas: Empresa[] };

type Aberto = { tipo: "direta"; tenantId: string; userId: string; titulo: string } | { tipo: "geral"; tenantId: string; titulo: string };

type Mensagem = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string };
  mediaType: "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO" | null;
  mediaFileName: string | null;
  isDeleted: boolean;
  createdAt: string;
  vistoPor?: string[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Marca como lido só com a aba à vista: um painel esquecido aberto não pode
// "ler" o que chegou (e acender o "Vista" para o cliente).
const fetcherMensagens = (url: string) => {
  const visivel = typeof document !== "undefined" && document.visibilityState === "visible";
  return fetch(visivel ? `${url}&marcar=1` : url).then((r) => r.json());
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Selo({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-auto shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-950">{n > 99 ? "99+" : n}</span>;
}

/**
 * Caixa de entrada do suporte da Dilon Tech: as conversas diretas escritas a
 * ele por usuários de qualquer empresa, e o Geral de cada empresa, onde ele
 * participa. O Geral é conversa da equipe de cada cliente — por isso o badge do
 * menu conta só as diretas, e o Geral mostra o contador aqui dentro.
 */
export function SuportePanel({ meuId }: { meuId: string }) {
  const { data: caixa, error } = useSWR<Caixa>("/api/admin/suporte", fetcher, { refreshInterval: LISTING_INTERVAL });
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [empresaNova, setEmpresaNova] = useState("");
  const [busca, setBusca] = useState("");

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const empresas = (caixa?.empresas ?? []).filter((e) => !termo || e.name.toLocaleLowerCase("pt-BR").includes(termo));
  const usuariosDaEmpresa = caixa?.empresas.find((e) => e.id === empresaNova)?.usuarios ?? [];

  return (
    <div className="flex h-[calc(100dvh-3rem)] md:h-screen text-neutral-100">
      <div className={`${aberto ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 border-r border-neutral-800 flex-col`}>
        <div className="p-4 border-b border-neutral-800">
          <h1 className="text-lg font-semibold">Suporte</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Conversas dos clientes com a Dilon Tech e o Geral de cada empresa.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && <p className="p-4 text-sm text-red-400">Não deu pra carregar.</p>}
          {!caixa && !error && <p className="p-4 text-sm text-neutral-500">Carregando...</p>}

          {caixa && (
            <>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Conversas diretas</p>
              {caixa.conversas.length === 0 && <p className="px-4 py-2 text-sm text-neutral-500">Ninguém escreveu ainda.</p>}
              {caixa.conversas.map((c) => {
                const ativo = aberto?.tipo === "direta" && aberto.userId === c.userId;
                return (
                  <button
                    key={c.userId}
                    onClick={() => setAberto({ tipo: "direta", tenantId: c.tenantId, userId: c.userId, titulo: `${c.nome} · ${c.empresa}` })}
                    className={`w-full text-left px-4 py-2.5 border-b border-neutral-900 hover:bg-neutral-900 ${ativo ? "bg-neutral-900" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{c.nome}</span>
                      <Selo n={ativo ? 0 : c.naoLidas} />
                    </span>
                    <span className="block text-[11px] text-neutral-500 truncate">{c.empresa}</span>
                    <span className="block text-xs text-neutral-400 truncate">
                      {c.deSuporte ? "Você: " : ""}
                      {c.ultima}
                    </span>
                  </button>
                );
              })}

              <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Nova conversa</p>
              <div className="px-4 pb-3 flex flex-col gap-2">
                <select value={empresaNova} onChange={(e) => setEmpresaNova(e.target.value)} className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm">
                  <option value="">Empresa…</option>
                  {caixa.empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                {empresaNova && (
                  <select
                    value=""
                    onChange={(e) => {
                      const u = usuariosDaEmpresa.find((x) => x.id === e.target.value);
                      if (u) setAberto({ tipo: "direta", tenantId: empresaNova, userId: u.id, titulo: `${u.name} · ${caixa.empresas.find((x) => x.id === empresaNova)?.name ?? ""}` });
                    }}
                    className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm"
                  >
                    <option value="">Pessoa…</option>
                    {usuariosDaEmpresa.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Geral das empresas</p>
              <div className="px-4 pb-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar empresa"
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm"
                />
              </div>
              {empresas.map((e) => {
                const ativo = aberto?.tipo === "geral" && aberto.tenantId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setAberto({ tipo: "geral", tenantId: e.id, titulo: `Geral · ${e.name}` })}
                    className={`w-full text-left px-4 py-2.5 border-b border-neutral-900 hover:bg-neutral-900 ${ativo ? "bg-neutral-900" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm truncate">{e.name}</span>
                      <Selo n={ativo ? 0 : e.geralNaoLidas} />
                    </span>
                    <span className="block text-[11px] text-neutral-500">{e.geralEm ? `Última mensagem ${hora(e.geralEm)}` : "Sem mensagens"}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {aberto ? (
        <Conversa
          key={aberto.tipo === "direta" ? `d-${aberto.userId}` : `g-${aberto.tenantId}`}
          aberto={aberto}
          meuId={meuId}
          onVoltar={() => setAberto(null)}
        />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-neutral-500">Escolha uma conversa.</div>
      )}
    </div>
  );
}

function Conversa({ aberto, meuId, onVoltar }: { aberto: Aberto; meuId: string; onVoltar: () => void }) {
  const query = aberto.tipo === "direta" ? `?empresa=${aberto.tenantId}&com=${aberto.userId}` : `?empresa=${aberto.tenantId}`;
  const { data: mensagens, mutate } = useSWR<Mensagem[]>(`/api/team-chat/messages${query}`, fetcherMensagens, { refreshInterval: MESSAGES_INTERVAL });
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "auto" });
  }, [mensagens?.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setErro(null);
    const res = await fetch("/api/team-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setorId: null,
        destinatarioId: aberto.tipo === "direta" ? aberto.userId : null,
        empresaId: aberto.tenantId,
        text: t,
      }),
    });
    setEnviando(false);
    if (!res.ok) return setErro("Não deu pra enviar.");
    setTexto("");
    mutate();
  }

  async function apagar(id: string) {
    if (!confirm("Apagar essa mensagem?")) return;
    await fetch(`/api/team-chat/messages/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <button onClick={onVoltar} className="md:hidden -ml-1 px-1 text-neutral-400 hover:text-neutral-100 text-lg leading-none" aria-label="Voltar para a lista">
            ←
          </button>
          <h2 className="text-sm font-semibold">{aberto.titulo}</h2>
        </div>
        <p className="text-xs text-neutral-500">
          {aberto.tipo === "direta"
            ? "Conversa privada: só a pessoa e o suporte veem."
            : "Canal Geral da empresa: todos os usuários dela veem o que você escrever, como Suporte Dilon Tech."}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {!mensagens ? (
          <p className="text-sm text-neutral-500">Carregando...</p>
        ) : mensagens.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma mensagem ainda.</p>
        ) : (
          mensagens.map((m) => {
            const minha = m.authorId === meuId;
            return (
              <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                <div className={`group max-w-[75%] rounded-lg px-3 py-2 ${minha ? "bg-emerald-700 text-white" : "bg-neutral-800 text-neutral-100"}`}>
                  {!minha && <p className="text-xs font-semibold mb-0.5 opacity-80">{m.author.name}</p>}
                  {m.isDeleted ? (
                    <p className="text-sm italic opacity-70">Mensagem apagada</p>
                  ) : (
                    <>
                      {m.mediaType === "IMAGE" && (
                        <a href={`/api/team-chat/messages/${m.id}/media`} target="_blank" rel="noopener noreferrer" className="block mb-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket, redireciona */}
                          <img src={`/api/team-chat/messages/${m.id}/media`} alt="Anexo" className="max-h-60 max-w-full rounded-md" />
                        </a>
                      )}
                      {m.mediaType === "AUDIO" && <audio controls preload="none" src={`/api/team-chat/messages/${m.id}/media`} className="max-w-full mb-1" style={{ height: 36 }} />}
                      {m.mediaType === "VIDEO" && <video controls preload="metadata" src={`/api/team-chat/messages/${m.id}/media`} className="max-h-60 max-w-full rounded-md mb-1" />}
                      {m.mediaType === "DOCUMENT" && (
                        <a href={`/api/team-chat/messages/${m.id}/media`} target="_blank" rel="noopener noreferrer" className="block text-sm underline mb-1">
                          📎 {m.mediaFileName ?? "Documento"}
                        </a>
                      )}
                      {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                  <p className="mt-1 text-[10px] opacity-60 flex items-center gap-2">
                    {hora(m.createdAt)}
                    {minha && m.vistoPor && m.vistoPor.length > 0 && <span>Vista</span>}
                    {minha && !m.isDeleted && (
                      <button onClick={() => apagar(m.id)} className="opacity-0 group-hover:opacity-100 hover:underline">
                        apagar
                      </button>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={fimRef} />
      </div>

      <form onSubmit={enviar} className="flex items-end gap-2 p-3 border-t border-neutral-800">
        <textarea
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }}
          disabled={enviando}
          placeholder="Escreva como Suporte Dilon Tech…"
          className="flex-1 resize-y max-h-40 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button type="submit" disabled={enviando || !texto.trim()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          Enviar
        </button>
      </form>
      {erro && <p className="px-4 pb-2 text-xs text-red-400">{erro}</p>}
    </div>
  );
}
