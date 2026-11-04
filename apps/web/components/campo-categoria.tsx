"use client";

import useSWR from "swr";

export type CategoriaFinanceira = { id: string; tipo: "RECEITA" | "DESPESA"; grupo: string; nome: string; ordem: number; ativa: boolean };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { categorias: [] }));

/** O plano de contas da empresa, compartilhado entre as telas do financeiro. */
export function useCategorias() {
  const { data, mutate } = useSWR<{ categorias: CategoriaFinanceira[] }>("/api/categorias-financeiras", fetcher, {
    revalidateOnFocus: false,
  });
  return { categorias: data?.categorias, mutate };
}

/** Agrupa na ordem do plano: [["Despesas fixas", [...]], ...]. */
export function porGrupo(categorias: CategoriaFinanceira[]) {
  const grupos = new Map<string, CategoriaFinanceira[]>();
  for (const c of categorias) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  return [...grupos.entries()];
}

/**
 * Escolha da categoria (plano de contas, Believe 29/10), com as opções
 * agrupadas como no relatório. Só mostra as do tipo certo: receita na conta a
 * receber, despesa na conta a pagar e no caixa. Categoria desativada só
 * aparece se for a atual — a conta antiga não perde o que tinha.
 *
 * `filtro` troca o "Sem categoria" vazio por "Todas" e acrescenta a opção de
 * achar as que ficaram sem.
 */
export function CampoCategoria({
  tipo,
  value,
  onChange,
  filtro = false,
  className,
  disabled,
}: {
  tipo: "RECEITA" | "DESPESA";
  value: string;
  onChange: (id: string) => void;
  filtro?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const { categorias } = useCategorias();
  const lista = (categorias ?? []).filter((c) => c.tipo === tipo && (c.ativa || c.id === value));

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={disabled || !categorias}>
      {filtro ? (
        <>
          <option value="">Todas</option>
          <option value="sem">Sem categoria</option>
        </>
      ) : (
        <option value="">{categorias ? "Sem categoria" : "Carregando…"}</option>
      )}
      {porGrupo(lista).map(([grupo, cs]) => (
        <optgroup key={grupo} label={grupo}>
          {cs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.ativa ? "" : " (desativada)"}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * A categoria dentro do detalhe da conta: troca na hora, sem botão de salvar.
 * Serve para classificar as contas que já existiam antes do plano de contas.
 */
export function TrocarCategoria({
  tipo,
  url,
  atual,
  disabled,
  onMudou,
}: {
  tipo: "RECEITA" | "DESPESA";
  url: string;
  atual: string | null;
  disabled?: boolean;
  onMudou: () => void;
}) {
  async function trocar(id: string) {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "categoria", categoriaId: id || null }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      alert(typeof b.error === "string" ? b.error : "não deu pra trocar a categoria");
    }
    onMudou();
  }
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
      Categoria
      <CampoCategoria
        tipo={tipo}
        value={atual ?? ""}
        onChange={trocar}
        disabled={disabled}
        className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm text-neutral-800"
      />
    </label>
  );
}
