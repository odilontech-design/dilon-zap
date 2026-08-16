"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

export type SavedText = {
  id: string;
  categoria: string;
  titulo: string;
  corpo: string;
  atalho: string | null;
  isActive: boolean;
};

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("falha ao carregar textos");
  return res.json();
}

const VAZIO = { categoria: "", titulo: "", corpo: "", atalho: "" };

export function TextsPanel({ podeEditar }: { podeEditar: boolean }) {
  const { data: textos, mutate } = useSWR<SavedText[]>("/api/saved-texts", fetcher);
  const [editando, setEditando] = useState<SavedText | typeof VAZIO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const categorias = useMemo(
    () => Array.from(new Set((textos ?? []).map((t) => t.categoria))).sort(),
    [textos]
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return textos ?? [];
    return (textos ?? []).filter(
      (t) =>
        t.titulo.toLowerCase().includes(q) ||
        t.corpo.toLowerCase().includes(q) ||
        t.categoria.toLowerCase().includes(q)
    );
  }, [textos, busca]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, SavedText[]>();
    for (const t of filtrados) {
      const lista = mapa.get(t.categoria) ?? [];
      lista.push(t);
      mapa.set(t.categoria, lista);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados]);

  async function excluir(t: SavedText) {
    if (!confirm(`Excluir "${t.titulo}"?`)) return;
    const res = await fetch(`/api/saved-texts/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      setErro("não deu pra excluir");
      return;
    }
    mutate();
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-semibold">Textos prontos</h1>
        {podeEditar && (
          <button
            onClick={() => {
              setErro(null);
              setEditando(VAZIO);
            }}
            className="rounded-md bg-accent text-white px-4 py-2 text-sm font-medium shrink-0"
          >
            Novo texto
          </button>
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-5">
        Respostas rápidas e scripts de abordagem, organizados por categoria. Ficam disponíveis dentro da conversa, no
        botão de raio ao lado do campo de mensagem.
      </p>

      {erro && (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{erro}</p>
      )}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por título, texto ou categoria"
        className="w-full mb-5 rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
      />

      {porCategoria.length === 0 && (
        <p className="text-sm text-neutral-500">
          {textos?.length === 0 ? "Nenhum texto cadastrado ainda." : "Nada encontrado para essa busca."}
        </p>
      )}

      {porCategoria.map(([categoria, lista]) => (
        <section key={categoria} className="mb-6">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{categoria}</h2>
          <div className="rounded-lg border border-neutral-200 bg-surface divide-y divide-neutral-200">
            {lista.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-800">
                      {t.titulo}
                      {t.atalho && (
                        <span className="ml-2 text-[10px] font-mono rounded bg-neutral-100 text-neutral-500 px-1.5 py-0.5">
                          /{t.atalho}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-neutral-500 mt-0.5 whitespace-pre-wrap line-clamp-3">{t.corpo}</p>
                  </div>
                  {podeEditar && (
                    <div className="flex gap-3 text-sm shrink-0">
                      <button
                        onClick={() => {
                          setErro(null);
                          setEditando(t);
                        }}
                        className="text-neutral-600 hover:text-accent"
                      >
                        Editar
                      </button>
                      <button onClick={() => excluir(t)} className="text-red-600 hover:text-red-700">
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editando && (
        <EditorTexto
          inicial={editando}
          categorias={categorias}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
          onErro={setErro}
        />
      )}
    </div>
  );
}

function EditorTexto({
  inicial,
  categorias,
  onFechar,
  onSalvo,
  onErro,
}: {
  inicial: SavedText | typeof VAZIO;
  categorias: string[];
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (m: string) => void;
}) {
  const editandoExistente = "id" in inicial;
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [corpo, setCorpo] = useState(inicial.corpo);
  const [atalho, setAtalho] = useState(inicial.atalho ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const res = await fetch(
      editandoExistente ? `/api/saved-texts/${(inicial as SavedText).id}` : "/api/saved-texts",
      {
        method: editandoExistente ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, titulo, corpo, atalho }),
      }
    );
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onErro(typeof body.error === "string" ? body.error : "não deu pra salvar");
      return;
    }
    onSalvo();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold mb-4">{editandoExistente ? "Editar texto" : "Novo texto"}</h2>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Categoria</span>
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            required
            list="categorias-existentes"
            placeholder="Ex: Saudação, Financeiro, Objeção de preço"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
          {/* Sugere o que já existe pra evitar "Financeiro" e "financeiro"
              virarem duas categorias separadas na lista. */}
          <datalist id="categorias-existentes">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Título</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            minLength={2}
            placeholder="Como esse texto aparece na lista"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Texto</span>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            required
            rows={7}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y"
          />
          <span className="text-xs text-neutral-500">
            Escreva <code className="font-mono">{"{nome}"}</code> onde quiser o primeiro nome do cliente — é trocado na
            hora de usar.
          </span>
        </label>

        <label className="block text-sm mb-5">
          <span className="text-neutral-700">Atalho (opcional)</span>
          <input
            value={atalho}
            onChange={(e) => setAtalho(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())}
            maxLength={20}
            placeholder="bomdia"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 font-mono"
          />
          <span className="text-xs text-neutral-500">Só letras e números. Serve pra achar rápido na busca.</span>
        </label>

        <div className="flex justify-end gap-3 text-sm">
          <button type="button" onClick={onFechar} className="px-4 py-2 text-neutral-600">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
