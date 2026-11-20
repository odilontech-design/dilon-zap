"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, secao } from "../comum";

type Conversa = { id: string; nome: string | null; username: string | null; ultimoTexto: string; ultimaMensagemEm: string; ultimaEntradaEm: string | null; naoLidas: number; respondidaEm: string | null; telefone: string | null; negociacaoId: string | null };
type Caixa = {
  gerencia: boolean;
  configurada: boolean;
  webhook: string | null;
  conta: { username: string; nome: string | null; status: "CONECTADA" | "ERRO" | "DESCONECTADA"; erro: string | null; webhookEm: string | null; expiraEm: string | null } | null;
  naoLidas: number;
  conversas: Conversa[];
};
type Detalhe = { conversa: { id: string; nome: string | null; username: string | null; ultimaEntradaEm: string | null; telefone: string | null; negociacaoId: string | null }; mensagens: { id: string; direcao: "ENTRADA" | "SAIDA"; texto: string; enviadaEm: string }[]; podeResponderAte: string | null };

const RETORNO: Record<string, { texto: string; erro?: boolean }> = {
  conectada: { texto: "Instagram conectado. As mensagens diretas novas vão aparecer aqui." },
  "conectada-sem-webhook": { texto: "Instagram conectado, mas a Meta ainda não confirmou o envio das mensagens novas. Veja o aviso abaixo.", erro: true },
  negada: { texto: "A autorização foi negada no Instagram.", erro: true },
  invalida: { texto: "O retorno do Instagram não confere com o pedido. Tente conectar de novo.", erro: true },
  falhou: { texto: "O Instagram não confirmou a conexão. Tente de novo em instantes.", erro: true },
  "outra-loja": { texto: "Esta conta do Instagram já está conectada em outra loja.", erro: true },
  "nao-configurada": { texto: "A integração com o Instagram ainda não foi configurada no servidor.", erro: true },
};

function quando(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

/** Caixa de entrada do Instagram da loja: conversas à esquerda, mensagens e resposta à direita. */
export function CaixaInstagram() {
  const { data, mutate } = useSWR<Caixa>("/api/instagram/conversas", fetcher, { refreshInterval: 10_000 });
  const params = useSearchParams();
  const [aberta, setAberta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  useEffect(() => {
    const r = params.get("ig");
    if (r && RETORNO[r]) setAviso(RETORNO[r]);
  }, [params]);
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const conta = data.conta;
  const conectada = conta?.status === "CONECTADA";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {aviso && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>
          {aviso.texto}
        </p>
      )}

      {!conectada ? (
        <section className={secao} data-testid="instagram-conectar">
          <h2 className="text-sm font-semibold">Instagram da loja</h2>
          {conta?.status === "ERRO" && conta.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{conta.erro}</p>}
          <p className="text-sm text-neutral-600">Conecte a conta profissional (comercial) do Instagram da loja. As mensagens diretas passam a chegar aqui, e a equipe responde sem sair do Zap. Quando o cliente passa o WhatsApp, vira negociação no CRM.</p>
          {!data.configurada && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">A integração ainda não foi configurada no servidor (app da Meta).</p>}
          {data.gerencia ? (
            <div>
              <a href="/api/instagram/conectar" className={`${botaoPrimario} inline-block ${data.configurada ? "" : "pointer-events-none opacity-50"}`}>
                {conta ? "Reconectar o Instagram" : "Conectar o Instagram"}
              </a>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Peça à gestão da loja para conectar.</p>
          )}
        </section>
      ) : (
        <section className={`${secao} !flex-row flex-wrap items-center justify-between`}>
          <div>
            <p className="text-sm font-semibold">@{conta!.username}</p>
            <p className="text-xs text-neutral-500">{data.naoLidas > 0 ? `${data.naoLidas} mensagem(ns) não lida(s)` : "Tudo lido"}</p>
          </div>
          {!conta!.webhookEm && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">As mensagens novas ainda não estão chegando (a Meta não confirmou o webhook). Peça à Dilon Tech para conferir o endereço de webhook do app.</p>}
          {data.gerencia && (
            <button className={botaoSecundario} onClick={async () => { if (confirm("Desconectar o Instagram? O histórico fica, mas as mensagens novas param de chegar.")) { await fetch("/api/instagram/desconectar", { method: "POST" }); mutate(); } }}>
              Desconectar
            </button>
          )}
        </section>
      )}

      {data.gerencia && data.webhook && (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Dados para configurar o app da Meta (Dilon Tech)</summary>
          <p className="mt-1">URL de callback do webhook: <code className="break-all rounded bg-neutral-100 px-1">{data.webhook}</code> · campo assinado: <code className="rounded bg-neutral-100 px-1">messages</code></p>
        </details>
      )}

      {(conectada || data.conversas.length > 0) && (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]" data-testid="caixa-instagram">
          <ul className="flex max-h-[70vh] flex-col divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 bg-surface">
            {data.conversas.length === 0 && <li className="p-6 text-center text-sm text-neutral-500">Nenhuma conversa ainda.</li>}
            {data.conversas.map((c) => {
              const espera = c.ultimaEntradaEm && (!c.respondidaEm || c.respondidaEm < c.ultimaEntradaEm);
              return (
                <li key={c.id}>
                  <button onClick={() => setAberta(c.id)} className={`flex w-full flex-col gap-0.5 px-3 py-3 text-left hover:bg-neutral-50 ${aberta === c.id ? "bg-accent/5" : ""}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.naoLidas ? "font-semibold" : "font-medium"}`}>{c.nome ?? (c.username ? `@${c.username}` : "Contato do Instagram")}</span>
                      <span className="shrink-0 text-xs text-neutral-400">{quando(c.ultimaMensagemEm)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-500">{c.ultimoTexto}</span>
                      {c.naoLidas > 0 && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[11px] text-white">{c.naoLidas}</span>}
                    </span>
                    {espera && <span className="text-[11px] text-amber-700">aguardando resposta há {quando(c.ultimaEntradaEm!)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {aberta ? <Conversa key={aberta} id={aberta} onMudou={() => mutate()} /> : <div className="hidden items-center justify-center rounded-lg border border-dashed border-neutral-300 p-8 text-sm text-neutral-500 md:flex">Escolha uma conversa.</div>}
        </div>
      )}
    </div>
  );
}

function Conversa({ id, onMudou }: { id: string; onMudou: () => void }) {
  const { data, mutate } = useSWR<Detalhe>(`/api/instagram/conversas/${id}`, fetcher, { refreshInterval: 8_000 });
  const [texto, setTexto] = useState("");
  const [tel, setTel] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [data?.mensagens.length]);
  if (!data) return <div className="rounded-lg border border-neutral-200 bg-surface p-6 text-sm text-neutral-500">Carregando…</div>;
  const dentroDaJanela = !!data.podeResponderAte && new Date(data.podeResponderAte).getTime() > Date.now();

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/instagram/conversas/${id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      setTexto("");
      mutate();
      onMudou();
    } finally {
      setEnviando(false);
    }
  }
  async function criarNegociacao() {
    setAviso(null);
    const r = await fetch(`/api/instagram/conversas/${id}/negociacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: tel }) });
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    setAviso({ texto: "Negociação criada no CRM, com uma tarefa de chamar no WhatsApp." });
    setTel("");
    mutate();
    onMudou();
  }

  return (
    <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{data.conversa.nome ?? (data.conversa.username ? `@${data.conversa.username}` : "Contato do Instagram")}</p>
          {data.conversa.username && <p className="text-xs text-neutral-500">@{data.conversa.username}</p>}
        </div>
        {data.conversa.negociacaoId ? (
          <Link href="/crm" className="text-xs text-accent hover:underline">Negociação no CRM{data.conversa.telefone ? ` · WhatsApp ${data.conversa.telefone}` : ""}</Link>
        ) : (
          <div className="flex items-center gap-2">
            <input aria-label="WhatsApp do cliente" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="WhatsApp do cliente" className={`${campo} w-44 !py-1.5`} />
            <button className={botaoSecundario} disabled={!tel.trim()} onClick={criarNegociacao}>Criar negociação</button>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-neutral-50 px-4 py-3">
        {data.mensagens.map((m) => (
          <div key={m.id} className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direcao === "SAIDA" ? "self-end bg-accent text-white" : "self-start border border-neutral-200 bg-surface"}`}>
            {m.texto}
            <span className={`mt-1 block text-[10px] ${m.direcao === "SAIDA" ? "text-white/70" : "text-neutral-400"}`}>{new Date(m.enviadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <div className="flex flex-col gap-2 border-t border-neutral-100 p-3">
        {aviso && <p className={`text-xs ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</p>}
        {!dentroDaJanela && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Passaram mais de 24 horas desde a última mensagem do cliente: o Instagram não deixa mais responder por aqui. Se ele passou o WhatsApp, chame por lá.</p>}
        <div className="flex gap-2">
          <textarea aria-label="Resposta" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} rows={2} maxLength={1000} disabled={!dentroDaJanela} placeholder={dentroDaJanela ? "Escreva a resposta (Enter envia)" : "Fora da janela de 24 h"} className={`${campo} flex-1 resize-none`} />
          <button className={botaoPrimario} disabled={enviando || !dentroDaJanela || !texto.trim()} onClick={enviar}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
