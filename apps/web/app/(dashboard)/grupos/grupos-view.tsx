"use client";

import { useState } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import { contactLabel, formatListTimestamp, type ContactRef } from "@/lib/contact";
import { CONVERSATION_LIST_INTERVAL } from "@/lib/polling";
import { ConversationThread } from "../inbox/inbox-view";

/**
 * Tela de grupos: os grupos que a equipe acompanha e a conversa do aberto.
 *
 * Separada do Inbox porque grupo não é atendimento — não tem responsável,
 * status nem fila —, e misturado à lista de clientes empurraria quem está
 * esperando resposta pra baixo de um grupo movimentado. A conversa em si é a
 * mesma do Inbox (ConversationThread em modoGrupo).
 */

type Grupo = ContactRef & { grupoParticipantes: number | null };

type GrupoResumo = {
  id: string;
  contact: Grupo;
  unreadCount: number;
  messages: { body: string; direction: "INBOUND" | "OUTBOUND"; createdAt: string; autorNome: string | null }[];
};

type GrupoCatalogo = Grupo & { grupoAtivadoEm: string | null };

async function fetcher(url: string) {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "não foi possível carregar");
  }
  return res.json();
}

// "Autor: texto", como o próprio WhatsApp mostra na lista de conversas de
// grupo. Sem o autor a prévia não diz nada: em grupo, quem falou é metade da
// informação.
function previa(m: GrupoResumo["messages"][number] | undefined) {
  if (!m) return "Nenhuma mensagem desde a ativação";
  const texto = m.body || "📎 Anexo";
  if (m.direction === "OUTBOUND") return `Você: ${texto}`;
  return m.autorNome ? `${m.autorNome}: ${texto}` : texto;
}

export function GruposView({ ehFinanceiro }: { ehFinanceiro: boolean }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [gerenciando, setGerenciando] = useState(false);
  const { data: grupos, error, mutate } = useSWR<GrupoResumo[]>("/api/grupos", fetcher, {
    refreshInterval: CONVERSATION_LIST_INTERVAL,
  });

  function abrir(id: string) {
    setSelecionado(id);
    fetch(`/api/conversations/${id}/read`, { method: "POST" }).then(() => mutate());
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] md:h-screen">
      <div
        className={`${
          selecionado ? "hidden" : "flex"
        } md:flex w-full md:w-80 shrink-0 border-r border-neutral-200 flex-col`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-200">
          <h1 className="text-lg font-semibold">Grupos</h1>
          <button
            onClick={() => setGerenciando(true)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
          >
            Gerenciar grupos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="text-sm text-red-600 px-4 py-6">{String(error.message ?? error)}</p>}
          {!grupos && !error && <p className="text-sm text-neutral-400 px-4 py-6">Carregando...</p>}
          {grupos?.length === 0 && (
            <div className="px-4 py-6 text-sm text-neutral-500 flex flex-col gap-2">
              <p>Nenhum grupo ativo ainda.</p>
              <p>
                Em{" "}
                <button onClick={() => setGerenciando(true)} className="text-accent hover:underline">
                  Gerenciar grupos
                </button>
                , escolha quais grupos do WhatsApp a equipe acompanha por aqui.
              </p>
            </div>
          )}

          {grupos?.map((g) => (
            <button
              key={g.id}
              onClick={() => abrir(g.id)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 ${
                selecionado === g.id ? "bg-neutral-100" : ""
              }`}
            >
              <div className="flex gap-3">
                <Avatar contact={g.contact} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${g.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                      {contactLabel(g.contact)}
                    </p>
                    {g.messages[0] && (
                      <span className="text-[11px] text-neutral-400 shrink-0">
                        {formatListTimestamp(g.messages[0].createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-xs truncate ${g.unreadCount > 0 ? "text-neutral-800" : "text-neutral-500"}`}>
                      {previa(g.messages[0])}
                    </p>
                    {g.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
                        {g.unreadCount > 9 ? "9+" : g.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`${selecionado ? "block" : "hidden"} md:block flex-1 min-w-0`}>
        {selecionado ? (
          <ConversationThread
            conversationId={selecionado}
            ehFinanceiro={ehFinanceiro}
            modoGrupo
            onChanged={() => mutate()}
            onBack={() => setSelecionado(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">Selecione um grupo</div>
        )}
      </div>

      {gerenciando && (
        <GerenciarGrupos
          onFechar={() => {
            setGerenciando(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function GerenciarGrupos({ onFechar }: { onFechar: () => void }) {
  const { data: grupos, error, mutate } = useSWR<GrupoCatalogo[]>("/api/grupos/catalogo", fetcher);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const termo = busca.trim().toLowerCase();
  const lista = (grupos ?? [])
    .filter((g) => !termo || contactLabel(g).toLowerCase().includes(termo))
    // Ativos primeiro: é o que a pessoa mais vem conferir aqui.
    .sort((a, b) => Number(!!b.grupoAtivadoEm) - Number(!!a.grupoAtivadoEm));
  const ativos = (grupos ?? []).filter((g) => g.grupoAtivadoEm).length;

  async function alternar(g: GrupoCatalogo) {
    const ativar = !g.grupoAtivadoEm;
    if (
      !ativar &&
      !confirm(
        `Deixar de acompanhar "${contactLabel(g)}"?\n\nAs mensagens já gravadas continuam aqui; as novas deixam de entrar.`
      )
    ) {
      return;
    }

    setSalvando(g.id);
    setAviso(null);
    const res = await fetch(`/api/grupos/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: ativar }),
    });
    setSalvando(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setAviso({ tipo: "erro", texto: typeof b.error === "string" ? b.error : "não deu pra salvar" });
      return;
    }
    mutate();
  }

  async function sincronizar() {
    setSincronizando(true);
    setAviso(null);
    const res = await fetch("/api/grupos/sincronizar", { method: "POST" });
    const b = await res.json().catch(() => ({}));
    setSincronizando(false);
    if (!res.ok) {
      setAviso({ tipo: "erro", texto: typeof b.error === "string" ? b.error : "não foi possível atualizar agora" });
      return;
    }
    setAviso({ tipo: "ok", texto: `Lista atualizada: ${b.total} grupo(s) neste número.` });
    mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-lg max-h-[92vh] flex flex-col"
      >
        <header className="p-5 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Gerenciar grupos</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Só os grupos ativos têm as mensagens gravadas e aparecem pra equipe. Mensagens de antes da ativação não
              são trazidas.
            </p>
          </div>
          <button
            onClick={onFechar}
            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        <div className="px-5 pt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar grupo..."
              className="flex-1 rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
            />
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              title="Busca no WhatsApp os grupos em que este número está"
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {sincronizando ? "Atualizando..." : "Atualizar lista"}
            </button>
          </div>
          {aviso && (
            <p
              className={`rounded-md px-3 py-2 text-sm ${
                aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "border border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {aviso.texto}
            </p>
          )}
          {grupos && grupos.length > 0 && (
            <p className="text-xs text-neutral-500">
              {ativos} de {grupos.length} grupo(s) ativo(s)
            </p>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {error && <p className="text-sm text-red-600">{String(error.message ?? error)}</p>}
          {!grupos && !error && <p className="text-sm text-neutral-400">Carregando...</p>}
          {grupos?.length === 0 && (
            <p className="text-sm text-neutral-500">
              Nenhum grupo conhecido ainda. Clique em <strong>Atualizar lista</strong> para buscar os grupos deste
              número no WhatsApp.
            </p>
          )}
          {grupos && grupos.length > 0 && lista.length === 0 && (
            <p className="text-sm text-neutral-500">Nenhum grupo com esse nome.</p>
          )}

          <ul className="divide-y divide-neutral-100">
            {lista.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2.5">
                <Avatar contact={g} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contactLabel(g)}</p>
                  <p className="text-xs text-neutral-500">
                    {g.grupoParticipantes ? `${g.grupoParticipantes} participantes` : "Participantes não informados"}
                    {g.grupoAtivadoEm &&
                      ` · acompanhando desde ${new Date(g.grupoAtivadoEm).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <button
                  onClick={() => alternar(g)}
                  disabled={salvando === g.id}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    g.grupoAtivadoEm
                      ? "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      : "bg-accent text-white hover:opacity-90"
                  }`}
                >
                  {salvando === g.id ? "Salvando..." : g.grupoAtivadoEm ? "Desativar" : "Ativar"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="p-4 border-t border-neutral-200 flex justify-end text-sm">
          <button onClick={onFechar} className="rounded-md border border-neutral-300 px-4 py-2">
            Concluir
          </button>
        </footer>
      </div>
    </div>
  );
}
