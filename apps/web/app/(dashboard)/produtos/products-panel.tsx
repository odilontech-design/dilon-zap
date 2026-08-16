"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  categoria: string | null;
  priceCents: number;
  isActive: boolean;
};

async function fetcher(url: string) {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  if (!res.ok) throw new Error("não foi possível carregar");
  return res.json();
}

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Converte preço escrito por gente em centavos.
 *
 * Precisa aguentar o formato brasileiro com separador de milhar
 * ("1.234,56"), que é como planilha exportada de sistema de PDV costuma vir.
 * A primeira versão disto só trocava vírgula por ponto e devolvia null
 * nesses casos — ou seja, todo produto acima de mil reais sumia da
 * importação sem ninguém perceber.
 *
 * Só com ponto é ambíguo: "19.90" é decimal, "1.234" é milhar. Decide pela
 * quantidade de casas depois do último ponto — três casas é milhar.
 *
 * Devolve null quando não dá pra ler, nunca 0: preço que vira zero em
 * silêncio entra no pedido e o cliente paga errado.
 */
export function parsePreco(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return null;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  let normalizado: string;
  if (temVirgula && temPonto) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    normalizado = limpo.replace(",", ".");
  } else if (temPonto) {
    const casasFinais = limpo.split(".").pop() ?? "";
    normalizado = casasFinais.length === 3 ? limpo.replace(/\./g, "") : limpo;
  } else {
    normalizado = limpo;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const VAZIO = { name: "", sku: "", categoria: "", preco: "" };

export function ProductsPanel({ podeEditar }: { podeEditar: boolean }) {
  const { data: produtos, mutate } = useSWR<Product[]>("/api/products?incluirInativos=1", fetcher);
  const [editando, setEditando] = useState<Product | typeof VAZIO | null>(null);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return produtos ?? [];
    return (produtos ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q)
    );
  }, [produtos, busca]);

  const ativos = (produtos ?? []).filter((p) => p.isActive).length;

  async function alternarAtivo(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    mutate();
  }

  async function importar(file: File) {
    setAviso(null);
    const texto = await file.text();
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
    if (linhas.length === 0) return;

    // Pula o cabeçalho quando a primeira linha não tem preço legível — é o
    // jeito de aceitar planilha com e sem cabeçalho sem perguntar nada.
    const separador = linhas[0].includes(";") ? ";" : ",";
    const primeira = linhas[0].split(separador);
    const temCabecalho = parsePreco(primeira[primeira.length - 1] ?? "") === null;

    const rows = linhas
      .slice(temCabecalho ? 1 : 0)
      .map((linha) => {
        const c = linha.split(separador).map((x) => x.trim().replace(/^"|"$/g, ""));
        // Ordem esperada: nome, preço [, código [, categoria]]
        const priceCents = parsePreco(c[1] ?? "");
        if (!c[0] || priceCents === null) return null;
        return { name: c[0], priceCents, sku: c[2] || undefined, categoria: c[3] || undefined };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      setAviso("Não consegui ler nenhuma linha. O formato esperado é: nome, preço, código, categoria.");
      return;
    }

    const res = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAviso(typeof body.error === "string" ? body.error : "não deu pra importar");
      return;
    }
    setAviso(
      `${body.criados} produto(s) criado(s), ${body.atualizados} atualizado(s)` +
        (body.ignorados > 0 ? `, ${body.ignorados} linha(s) ignorada(s)` : "") +
        "."
    );
    mutate();
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <h1 className="text-xl font-semibold">Produtos</h1>
        {podeEditar && (
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
            >
              Importar CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importar(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => {
                setAviso(null);
                setEditando(VAZIO);
              }}
              className="text-xs rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90"
            >
              + Novo produto
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {ativos} ativo{ativos === 1 ? "" : "s"} de {produtos?.length ?? 0}. Preço de tabela usado ao montar pedido.
      </p>

      {aviso && (
        <p className="mb-4 rounded-md bg-accent/10 text-accent px-3 py-2 text-sm flex items-center justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-xs hover:underline">
            fechar
          </button>
        </p>
      )}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, código ou categoria"
        className="w-full mb-4 rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
      />

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Produto</th>
              <th className="text-left font-medium px-4 py-2.5">Categoria</th>
              <th className="text-right font-medium px-4 py-2.5">Preço</th>
              {podeEditar && <th className="text-right font-medium px-4 py-2.5">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  {produtos?.length === 0
                    ? "Nenhum produto cadastrado. Importe um CSV ou cadastre o primeiro."
                    : "Nada encontrado."}
                </td>
              </tr>
            )}
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b border-neutral-200 last:border-0">
                <td className="px-4 py-2.5">
                  <span className={p.isActive ? "font-medium text-neutral-800" : "text-neutral-400"}>{p.name}</span>
                  {p.sku && <span className="ml-2 text-[10px] font-mono text-neutral-400">{p.sku}</span>}
                  {!p.isActive && (
                    <span className="ml-2 text-[10px] rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5">
                      inativo
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{p.categoria ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{centsToBRL(p.priceCents)}</td>
                {podeEditar && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => setEditando(p)} className="text-neutral-600 hover:text-accent mr-3">
                      Editar
                    </button>
                    <button
                      onClick={() => alternarAtivo(p)}
                      className={p.isActive ? "text-red-600 hover:text-red-700" : "text-accent"}
                    >
                      {p.isActive ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        CSV na ordem: <code className="font-mono">nome, preço, código, categoria</code>. Código e categoria são
        opcionais. Reimportar a mesma planilha atualiza os preços em vez de duplicar.
      </p>

      {editando && (
        <EditorProduto
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mutate();
          }}
          onErro={setAviso}
        />
      )}
    </div>
  );
}

function EditorProduto({
  inicial,
  onFechar,
  onSalvo,
  onErro,
}: {
  inicial: Product | typeof VAZIO;
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (m: string) => void;
}) {
  const existente = "id" in inicial;
  const [name, setName] = useState(inicial.name);
  const [sku, setSku] = useState(inicial.sku ?? "");
  const [categoria, setCategoria] = useState(inicial.categoria ?? "");
  const [preco, setPreco] = useState(
    existente ? ((inicial as Product).priceCents / 100).toFixed(2).replace(".", ",") : ""
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = parsePreco(preco);
    if (priceCents === null) {
      onErro("Preço inválido. Use por exemplo 19,90.");
      return;
    }

    setSalvando(true);
    const res = await fetch(existente ? `/api/products/${(inicial as Product).id}` : "/api/products", {
      method: existente ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sku, categoria, priceCents }),
    });
    setSalvando(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      onErro(typeof b.error === "string" ? b.error : "não deu pra salvar");
      return;
    }
    onSalvo();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold mb-4">{existente ? "Editar produto" : "Novo produto"}</h2>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Preço</span>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            required
            inputMode="decimal"
            placeholder="19,90"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 tabular-nums"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <label className="block text-sm">
            <span className="text-neutral-700">Código (opcional)</span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">Categoria (opcional)</span>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex: Loiros"
              className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
            />
          </label>
        </div>

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
