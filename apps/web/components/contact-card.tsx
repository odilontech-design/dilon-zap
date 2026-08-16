"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import { contactLabel, formatPhoneDisplay, type ContactRef } from "@/lib/contact";
import { corDoMotivo } from "@/lib/close-reasons";

/**
 * Ficha do cliente: tudo sobre uma pessoa num lugar só, com os campos
 * editáveis ali mesmo.
 *
 * Existe porque o funil mostrava nome e valor, e mais nada. Pra saber quem
 * era a pessoa, a atendente tinha que abrir a conversa, e pra lembrar do que
 * já rolou tinha que rolar o histórico inteiro. A ficha responde "quem é,
 * onde parou, o que já aconteceu" sem sair do lugar.
 */

type ConversaResumo = {
  id: string;
  ticketNumber: number;
  status: "OPEN" | "PENDING" | "RESOLVED";
  tags: string[];
  closeReason: string | null;
  closedAt: string | null;
  createdAt: string;
  lastMessageAt: string;
  assignedTo: { name: string } | null;
  messages: { body: string; direction: "INBOUND" | "OUTBOUND"; mediaType: string | null }[];
  _count: { messages: number };
};

type Ficha = ContactRef & {
  stageId: string | null;
  dealValueCents: number;
  notes: string | null;
  notesUpdatedAt: string | null;
  hasWhatsapp: boolean | null;
  createdAt: string;
  stage: { id: string; name: string; color: string } | null;
  conversations: ConversaResumo[];
};

type StageDef = { id: string; name: string; color: string };

/**
 * Lança em resposta não-OK em vez de devolver o corpo de erro como dado.
 *
 * Sem isso, um { error: "not found" } de um 404 é um objeto verdadeiro: o
 * componente passa do "está carregando?" e tenta ler conversations.length de
 * um objeto que não tem conversations — tela branca. Mesmo erro que já tinha
 * sido corrigido no Inbox.
 */
async function fetcher(url: string) {
  const res = await fetch(url);

  // Sessão expirada não vem como erro: a rota redireciona pro login, que
  // responde 200 com HTML. O res.ok passa, o res.json() quebra, e a
  // atendente via "Unexpected token '<'" sem entender nada. Checar o
  // content-type é o que separa "caiu a sessão" de "deu erro de verdade".
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error("sua sessão expirou — entre de novo");
  }

  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new Error(typeof corpo.error === "string" ? corpo.error : "não foi possível carregar");
  }
  return res.json();
}

const STATUS_LABEL: Record<ConversaResumo["status"], string> = {
  OPEN: "Aberto",
  PENDING: "Pendente",
  RESOLVED: "Fechado",
};

function data(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function previa(c: ConversaResumo) {
  const m = c.messages[0];
  if (!m) return "Sem mensagens";
  if (m.body) return m.body;
  if (m.mediaType === "IMAGE") return "📷 Imagem";
  if (m.mediaType === "AUDIO") return "🎤 Áudio";
  if (m.mediaType === "VIDEO") return "🎥 Vídeo";
  if (m.mediaType === "DOCUMENT") return "📄 Documento";
  return "";
}

export function ContactCard({ contactId, onFechar }: { contactId: string; onFechar: () => void }) {
  const router = useRouter();
  const { data: ficha, error: fichaErro, mutate } = useSWR<Ficha>(`/api/contacts/${contactId}`, fetcher);
  const { data: stages } = useSWR<StageDef[]>("/api/stages", fetcher);

  const [nome, setNome] = useState<string | null>(null);
  const [valor, setValor] = useState<string | null>(null);
  const [anotacoes, setAnotacoes] = useState<string | null>(null);

  async function salvar(campos: Record<string, unknown>) {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    mutate();
  }

  // Erro tem que ter saída própria: sem isso a ficha ficaria em "Carregando"
  // pra sempre quando o contato não existe ou a sessão caiu, e a atendente
  // não teria como saber se é lentidão ou se quebrou.
  if (fichaErro) {
    return (
      <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-surface rounded-lg border border-neutral-200 p-6 max-w-sm text-center"
        >
          <p className="text-sm text-neutral-700 mb-1">Não deu pra abrir a ficha</p>
          <p className="text-xs text-neutral-500 mb-4">{String(fichaErro.message ?? fichaErro)}</p>
          <button onClick={onFechar} className="text-sm text-accent hover:underline">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
        <div className="bg-surface rounded-lg p-6 text-sm text-neutral-500">Carregando ficha...</div>
      </div>
    );
  }

  const totalAtendimentos = ficha.conversations.length;
  const primeiraInteracao = ficha.conversations.at(-1)?.createdAt ?? ficha.createdAt;

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <header className="flex items-start gap-3 p-5 border-b border-neutral-200">
          <Avatar contact={ficha} size={52} />
          <div className="flex-1 min-w-0">
            <input
              value={nome ?? ficha.name ?? ""}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => {
                if (nome !== null && nome !== (ficha.name ?? "")) salvar({ name: nome.trim() || null });
              }}
              placeholder={formatPhoneDisplay(ficha)}
              className="w-full text-lg font-semibold bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-accent focus:outline-none"
            />
            <p className="text-sm text-neutral-500 mt-0.5">
              {formatPhoneDisplay(ficha)}
              {ficha.hasWhatsapp === false && (
                <span className="ml-2 text-[10px] rounded-full bg-red-100 text-red-900 px-2 py-0.5">sem WhatsApp</span>
              )}
            </p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none" aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="text-xs font-medium text-neutral-700">Etapa do funil</span>
              <select
                value={ficha.stageId ?? ""}
                onChange={(e) => salvar({ stageId: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5"
              >
                <option value="">Sem etapa</option>
                {stages?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="text-xs font-medium text-neutral-700">Valor do negócio</span>
              <input
                value={valor ?? (ficha.dealValueCents / 100).toFixed(2)}
                onChange={(e) => setValor(e.target.value)}
                onBlur={() => {
                  if (valor === null) return;
                  const cents = Math.round(parseFloat(valor.replace(",", ".")) * 100);
                  salvar({ dealValueCents: Number.isFinite(cents) && cents >= 0 ? cents : 0 });
                }}
                inputMode="decimal"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 tabular-nums"
              />
            </label>
          </div>

          <label className="text-sm">
            <span className="text-xs font-medium text-neutral-700">Anotações</span>
            <textarea
              value={anotacoes ?? ficha.notes ?? ""}
              onChange={(e) => setAnotacoes(e.target.value)}
              onBlur={() => {
                if (anotacoes !== null && anotacoes !== (ficha.notes ?? "")) salvar({ notes: anotacoes });
              }}
              rows={3}
              placeholder="O que vale lembrar sobre esse cliente"
              className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y"
            />
            {ficha.notesUpdatedAt && (
              <span className="text-[10px] text-neutral-400">Atualizada em {data(ficha.notesUpdatedAt)}</span>
            )}
          </label>

          <div className="flex gap-6 text-sm border-y border-neutral-200 py-3">
            <div>
              <p className="text-xs text-neutral-500">Atendimentos</p>
              <p className="font-semibold tabular-nums">{totalAtendimentos}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Cliente desde</p>
              <p className="font-semibold tabular-nums">{data(primeiraInteracao)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Valor no funil</p>
              <p className="font-semibold tabular-nums">{centsToBRL(ficha.dealValueCents)}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Histórico de atendimentos</h3>
            {totalAtendimentos === 0 && <p className="text-sm text-neutral-500">Nenhum atendimento ainda.</p>}
            <div className="flex flex-col gap-2">
              {ficha.conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/inbox?open=${c.id}`)}
                  className="text-left rounded-md border border-neutral-200 px-3 py-2 hover:border-accent hover:bg-accent/5"
                >
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono text-neutral-500">#{c.ticketNumber}</span>
                    <span className="text-neutral-600">{STATUS_LABEL[c.status]}</span>
                    {c.closeReason && (
                      <span className={`rounded-full px-2 py-0.5 ${corDoMotivo(c.closeReason)}`}>{c.closeReason}</span>
                    )}
                    {c.assignedTo && <span className="text-neutral-500">· {c.assignedTo.name}</span>}
                    <span className="text-neutral-400 ml-auto tabular-nums">
                      {data(c.createdAt)}
                      {c.closedAt && ` → ${data(c.closedAt)}`}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 truncate mt-1">{previa(c)}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{c._count.messages} mensagens</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
