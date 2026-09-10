"use client";

import { useState } from "react";
import useSWR from "swr";
import { readableTextColor } from "@/lib/tags";

type Membro = { id: string; nome: string; ativo: boolean };
type Setor = {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
  conversas: number;
  membros: Membro[];
};
// /api/users sem parametro ja devolve SO os ativos, e so id e nome — nao
// existe deactivatedAt aqui pra filtrar. Filtrar por um campo ausente
// esvaziaria a lista inteira em silencio.
type Usuario = { id: string; name: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Paleta fixa em vez de seletor livre: o papel da cor aqui é distinguir
// setores de relance no Inbox, e cor escolhida a dedo costuma sair clara
// demais pro texto por cima ficar legível.
const CORES = ["#0F766E", "#1D4ED8", "#7C3AED", "#B91C1C", "#B45309", "#4D7C0F", "#BE185D", "#334155"];

export function SetoresPanel({ podeEditar }: { podeEditar: boolean }) {
  const { data: setores, mutate } = useSWR<Setor[]>("/api/setores", fetcher);
  const { data: usuarios } = useSWR<Usuario[]>("/api/users", fetcher);
  const [editando, setEditando] = useState<Setor | "novo" | null>(null);

  const equipe = usuarios ?? [];

  async function remover(setor: Setor) {
    const aviso =
      setor.conversas > 0
        ? `Excluir o setor "${setor.nome}"? ${setor.conversas} conversa(s) perdem a marcação de setor — o histórico continua, mas deixa de dizer de quem era o assunto. Desativar preserva essa informação.`
        : `Excluir o setor "${setor.nome}"?`;
    if (!confirm(aviso)) return;

    const res = await fetch(`/api/setores/${setor.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      alert(typeof body.error === "string" ? body.error : "não deu pra remover");
      return;
    }
    mutate();
  }

  async function alternarAtivo(setor: Setor) {
    await fetch(`/api/setores/${setor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !setor.ativo }),
    });
    mutate();
  }

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-neutral-600 mb-6">
        Setor é para quem divide o atendimento por assunto. O menu de triagem encaminha a
        conversa para o setor, e ela fica numa fila que toda a equipe do setor enxerga —
        qualquer pessoa pode assumir. É diferente de encaminhar para alguém: aí a conversa
        já sai com dono, e se essa pessoa estiver fora, ninguém mais é acionado.
      </p>

      {podeEditar && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setEditando("novo")}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Novo setor
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {setores?.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-8 text-center text-sm text-neutral-400">
            Nenhum setor criado ainda.
          </p>
        )}

        {setores?.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border border-neutral-200 bg-surface p-4 ${s.ativo ? "" : "opacity-60"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="rounded px-2 py-0.5 text-xs font-medium"
                    style={{ background: s.cor, color: readableTextColor(s.cor) }}
                  >
                    {s.nome}
                  </span>
                  {!s.ativo && <span className="text-xs text-neutral-500">desativado</span>}
                </div>

                {s.membros.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    Sem ninguém dentro. Uma fila que ninguém enxerga não recebe atendimento.
                  </p>
                ) : (
                  <p className="text-sm text-neutral-600">
                    {s.membros.map((m) => (m.ativo ? m.nome : `${m.nome} (inativo)`)).join(", ")}
                  </p>
                )}

                {s.conversas > 0 && (
                  <p className="mt-1 text-xs text-neutral-400">
                    {s.conversas} conversa(s) neste setor
                  </p>
                )}
              </div>

              {podeEditar && (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button onClick={() => setEditando(s)} className="text-accent hover:underline">
                    Editar
                  </button>
                  <button onClick={() => alternarAtivo(s)} className="text-neutral-600 hover:underline">
                    {s.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button onClick={() => remover(s)} className="text-red-600 hover:underline">
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <Formulario
          setor={editando === "novo" ? null : editando}
          equipe={equipe}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function Formulario({
  setor,
  equipe,
  onFechar,
  onSalvo,
}: {
  setor: Setor | null;
  equipe: Usuario[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(setor?.nome ?? "");
  const [cor, setCor] = useState(setor?.cor ?? CORES[0]);
  const [membros, setMembros] = useState<string[]>(setor?.membros.map((m) => m.id) ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function alternar(id: string) {
    setMembros((atual) => (atual.includes(id) ? atual.filter((m) => m !== id) : [...atual, id]));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    const res = await fetch(setor ? `/api/setores/${setor.id}` : "/api/setores", {
      method: setor ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, cor, membros }),
    });
    setSalvando(false);

    if (!res.ok) {
      const body = await res.json();
      setErro(typeof body.error === "string" ? body.error : "não deu pra salvar");
      return;
    }
    onSalvo();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={salvar} className="w-full max-w-md rounded-lg border border-neutral-200 bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">{setor ? "Editar setor" : "Novo setor"}</h2>

        <label className="mb-3 block text-sm">
          <span className="text-neutral-700">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            maxLength={40}
            placeholder="Ex: Fiscal"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        <div className="mb-4 text-sm">
          <span className="text-neutral-700">Cor</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                className={`h-7 w-7 rounded-full border-2 ${cor === c ? "border-neutral-900" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="mb-4 text-sm">
          <span className="text-neutral-700">Quem atende este setor</span>
          <p className="mb-1.5 text-xs text-neutral-500">
            Todos aqui veem a fila do setor e podem assumir qualquer conversa dela.
          </p>
          <div className="max-h-44 overflow-y-auto rounded-md border border-neutral-200">
            {equipe.length === 0 && (
              <p className="px-3 py-3 text-xs text-neutral-500">Nenhum usuário ativo na equipe.</p>
            )}
            {equipe.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-neutral-50">
                <input type="checkbox" checked={membros.includes(u.id)} onChange={() => alternar(u.id)} />
                {u.name}
              </label>
            ))}
          </div>
          {membros.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              Setor sem ninguém não pode receber encaminhamento do menu.
            </p>
          )}
        </div>

        {erro && <p className="mb-3 text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-3 text-sm">
          <button type="button" onClick={onFechar} className="px-4 py-2 text-neutral-600">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
