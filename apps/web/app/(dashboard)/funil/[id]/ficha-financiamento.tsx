"use client";

import { useState } from "react";
import useSWR from "swr";
import { CAMPOS, TITULOS, type Campo } from "@/lib/ficha-campos";

type Resumo = { id: string; secoes: string[]; createdAt: string; apagarEm: string };
type Lista = { fichas: Resumo[]; podeApagar: boolean };
type Grupo = Record<string, string>;
type Aberta = { pessoais: Grupo; endereco?: Grupo; profissional?: Grupo; conjuge?: Grupo; refPessoais?: Grupo[]; refBancarias?: Grupo[]; veiculo?: Grupo; consentimentoEm?: string; veiculoNome?: string | null };

const buscar = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));
const data = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const valor = (c: Campo, v: string) => (c.tipo === "data" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : c.tipo === "dinheiro" ? `R$ ${v}` : v);

function Linhas({ campos, g }: { campos: Campo[]; g?: Grupo }) {
  if (!g) return null;
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {campos.filter((c) => g[c.chave]).map((c) => (
        <div key={c.chave} className="flex gap-2 text-sm">
          <dt className="shrink-0 text-neutral-500">{c.rotulo}:</dt>
          <dd className="font-medium">{valor(c, g[c.chave])}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Fichas de financiamento que chegaram pelo site. Os dados só aparecem ao abrir (fica registrado). */
export function FichaDeFinanciamento({ negociacaoId }: { negociacaoId: string }) {
  const url = `/api/negociacoes/${negociacaoId}/ficha`;
  const { data: lista, mutate } = useSWR<Lista | null>(url, buscar);
  const [aberta, setAberta] = useState<{ id: string; dados: Aberta } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!lista || lista.fichas.length === 0) return null;

  const abrir = async (id: string) => {
    setErro(null);
    const r = await fetch(`${url}?ficha=${id}`, { cache: "no-store" });
    if (!r.ok) return setErro((await r.json().catch(() => null))?.error ?? "não deu para abrir a ficha");
    setAberta({ id, dados: await r.json() });
  };
  const apagar = async (id: string) => {
    if (!confirm("Apagar esta ficha? Os dados do cliente somem de vez.")) return;
    const r = await fetch(`${url}?ficha=${id}`, { method: "DELETE" });
    if (!r.ok) return setErro((await r.json().catch(() => null))?.error ?? "não deu para apagar");
    setAberta(null);
    mutate();
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
      <h3 className="text-sm font-semibold">Ficha de financiamento</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {lista.fichas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>Recebida em {data(f.createdAt)} <span className="text-xs text-neutral-500">· apaga em {data(f.apagarEm)}</span></span>
            <span className="flex gap-2">
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => abrir(f.id)}>Abrir</button>
              {lista.podeApagar && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => apagar(f.id)}>Apagar</button>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">Dados sensíveis (CPF, renda, conta). Cada abertura fica registrada.</p>
      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:static print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label="Ficha de financiamento">
          {/* Ao imprimir, só a ficha sai no papel (o resto da página some). */}
          <style>{"@media print { body * { visibility: hidden !important; } .ficha-impressao, .ficha-impressao * { visibility: visible !important; } .ficha-impressao { position: absolute; left: 0; top: 0; } }"}</style>
          <div className="ficha-impressao w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl bg-surface p-6 shadow-xl print:max-w-none print:shadow-none">
            <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
              <h2 className="text-lg font-semibold">Ficha de financiamento</h2>
              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => window.print()}>Imprimir / PDF</button>
                <button type="button" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => setAberta(null)}>Fechar</button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <Bloco titulo={TITULOS.pessoais}><Linhas campos={CAMPOS.pessoais} g={aberta.dados.pessoais} /></Bloco>
              {aberta.dados.endereco && <Bloco titulo={TITULOS.endereco}><Linhas campos={CAMPOS.endereco} g={aberta.dados.endereco} /></Bloco>}
              {aberta.dados.profissional && <Bloco titulo={TITULOS.profissional}><Linhas campos={CAMPOS.profissional} g={aberta.dados.profissional} /></Bloco>}
              {aberta.dados.conjuge && <Bloco titulo={TITULOS.conjuge}><Linhas campos={CAMPOS.conjuge} g={aberta.dados.conjuge} /></Bloco>}
              {aberta.dados.refPessoais?.map((r, i) => <Bloco key={`p${i}`} titulo={`Referência pessoal ${i + 1}`}><Linhas campos={CAMPOS.refPessoal} g={r} /></Bloco>)}
              {aberta.dados.refBancarias?.map((r, i) => <Bloco key={`b${i}`} titulo={`Referência bancária ${i + 1}`}><Linhas campos={CAMPOS.refBancaria} g={r} /></Bloco>)}
              {aberta.dados.veiculo && (
                <Bloco titulo={TITULOS.veiculo}>
                  {aberta.dados.veiculoNome && <p className="text-sm font-medium">{aberta.dados.veiculoNome}</p>}
                  <Linhas campos={CAMPOS.veiculo} g={aberta.dados.veiculo} />
                </Bloco>
              )}
              {aberta.dados.consentimentoEm && <p className="text-xs text-neutral-500">O cliente autorizou o uso dos dados para análise de crédito em {new Date(aberta.dados.consentimentoEm).toLocaleString("pt-BR")}.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-b border-neutral-100 pb-3">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}
