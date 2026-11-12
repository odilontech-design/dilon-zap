"use client";

import { useEffect, useState } from "react";
import { useRecurso } from "@/components/recursos-context";
import Link from "next/link";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos, type FaixaEstoque } from "@/lib/veiculos-regras";

/** Peças das telas da revenda: estilos, campo de dinheiro, busca de cliente, FIPE. */

export const campo =
  "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
export const rotulo = "text-xs font-medium text-neutral-700";
export const secao = "flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-4";
export const botaoPrimario = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const botaoSecundario = "rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-accent disabled:opacity-50";

export { fetcher, erroDaResposta, diaParaISO, isoParaDia } from "../otica/formatos";

export const COR_FAIXA: Record<FaixaEstoque, string> = {
  novo: "bg-neutral-100 text-neutral-600",
  atencao: "bg-amber-500/10 text-amber-700",
  parado: "bg-orange-500/15 text-orange-700",
  critico: "bg-red-500/10 text-red-600",
};

export function brl(cents: number | null | undefined) {
  return cents == null ? "—" : centsToBRL(cents);
}

/** Hoje + n dias, no formato do <input type="date">. */
export function diaDaqui(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Campo de dinheiro: a pessoa digita "85.900" ou "85900,50" e o valor sai em
 * centavos. Mostra o texto como foi digitado e só reformata ao sair do campo.
 */
export function CampoDinheiro({
  id,
  valor,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  valor: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const formatar = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [texto, setTexto] = useState(formatar(valor));
  const [focado, setFocado] = useState(false);
  useEffect(() => {
    if (!focado) setTexto(formatar(valor));
  }, [valor, focado]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">R$</span>
      <input
        id={id}
        inputMode="decimal"
        value={texto}
        disabled={disabled}
        placeholder={placeholder ?? "0,00"}
        onFocus={() => setFocado(true)}
        onBlur={() => {
          setFocado(false);
          setTexto(formatar(valor));
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(reaisParaCentavos(e.target.value));
        }}
        className={`${campo} pl-9 tabular-nums`}
      />
    </div>
  );
}

export type ClienteEscolhido = { contactId: string; nome: string } | { novoCliente: { nome: string; telefone: string } } | null;

type Achado = { id: string; nome: string | null; telefone: string | null };

/**
 * Escolhe o cliente: busca nos contatos (nome ou telefone) ou cadastra um novo
 * pelo WhatsApp, como a OS da ótica.
 */
export function BuscaCliente({ id, valor, onChange, rotuloNovo = "Cliente novo? Nome e WhatsApp:" }: { id: string; valor: ClienteEscolhido; onChange: (c: ClienteEscolhido) => void; rotuloNovo?: string }) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const escolhido = valor && "contactId" in valor ? valor : null;

  useEffect(() => {
    if (escolhido || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/negociacoes/contatos?q=${encodeURIComponent(busca.trim())}`);
      if (r.ok) setAchados(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [busca, escolhido]);

  useEffect(() => {
    if (escolhido) return;
    onChange(nome.trim() && telefone.replace(/\D/g, "").length >= 10 ? { novoCliente: { nome: nome.trim(), telefone } } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, telefone]);

  if (escolhido) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
        <span className="font-medium">{escolhido.nome}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-neutral-500 hover:text-neutral-800">
          trocar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input id={id} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato por nome ou telefone" className={campo} />
        {achados.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-neutral-200 bg-surface shadow">
            {achados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    onChange({ contactId: c.id, nome: c.nome || c.telefone || "Sem nome" });
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  {c.nome || "Sem nome"} <span className="text-xs text-neutral-400">{c.telefone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-neutral-500">{rotuloNovo}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={campo} />
        <input id={`${id}-tel`} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
      </div>
    </div>
  );
}

/** O que vai para a rota a partir do cliente escolhido. */
export function clienteParaRota(c: ClienteEscolhido) {
  if (!c) return null;
  return "contactId" in c ? { contactId: c.contactId } : { novoCliente: c.novoCliente };
}

export function AbasVeiculos({ atual, gerencia }: { atual: "estoque" | "vendidos" | "novo" | "vitrine" | "importar" | "vendedor-ia"; gerencia: boolean }) {
  const temIa = useRecurso("VENDEDOR_IA");
  const abas = [
    { id: "estoque", href: "/veiculos", rotulo: "Estoque" },
    { id: "vendidos", href: "/veiculos?status=VENDIDO", rotulo: "Vendidos" },
    ...(gerencia
      ? [
          { id: "importar", href: "/veiculos/importar", rotulo: "Importar planilha" },
          { id: "vitrine", href: "/veiculos/configuracoes", rotulo: "Vitrine" },
          ...(temIa ? [{ id: "vendedor-ia", href: "/veiculos/vendedor-ia", rotulo: "Vendedor IA" }] : []),
        ]
      : []),
  ];
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-lg font-semibold">Veículos</h1>
      <nav className="flex flex-wrap gap-1 text-sm">
        {abas.map((a) =>
          a.id === atual ? (
            <span key={a.id} className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">
              {a.rotulo}
            </span>
          ) : (
            <Link key={a.id} href={a.href} className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
              {a.rotulo}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
