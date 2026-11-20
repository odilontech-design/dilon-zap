"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { erroDaResposta } from "./formatos";

/**
 * Cadastro de laboratório sem sair da OS (Visuallis, 13/11): a foto do talão traz o nome do laboratório
 * ("Forla"), ele ainda não está cadastrado, e a atendente tinha de largar a OS para cadastrar em "Laboratórios e
 * avisos". Mesma rota e mesma regra da tela de Laboratórios (só a gestão cadastra); só muda o lugar. O que foi
 * salvo volta para a OS, que já escolhe o laboratório e sugere a previsão pelo prazo dele.
 */

export type LaboratorioNovo = { id: string; nome: string; telefone: string | null; contato: string | null; prazoDias: number | null };

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const rotulo = "text-xs font-medium text-neutral-700";

export function FormularioLaboratorio({
  nomeInicial,
  onSalvo,
  onFechar,
}: {
  nomeInicial?: string;
  onSalvo: (l: LaboratorioNovo) => void;
  onFechar: () => void;
}) {
  const [f, setF] = useState({ nome: nomeInicial ?? "", telefone: "", contato: "", prazo: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    // O formulário da OS é o pai deste na árvore do React: sem isto o envio daqui subiria e tentaria salvar a OS.
    e.stopPropagation();
    setErro(null);
    const prazo = f.prazo.trim() ? Number(f.prazo) : null;
    if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0 || prazo > 90)) return setErro("O prazo é um número de dias, de 0 a 90.");
    setSalvando(true);
    try {
      const r = await fetch("/api/otica/laboratorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: f.nome, telefone: f.telefone, contato: f.contato, prazoDias: prazo }),
      });
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("application/json")) return setErro("Sua sessão expirou. Entre de novo; nada foi salvo.");
      if (!r.ok) return setErro(await erroDaResposta(r));
      onSalvo((await r.json()) as LaboratorioNovo);
    } catch {
      setErro("Sem conexão com o servidor. Nada foi salvo; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  // Num portal: este formulário é aberto de dentro do formulário da OS, e <form> dentro de <form> não vale em HTML.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Cadastrar laboratório">
      <form onSubmit={salvar} className="bg-surface rounded-lg p-5 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-lg">
        <h2 className="text-base font-semibold mb-1">Cadastrar laboratório</h2>
        <p className="text-xs text-neutral-500 mb-4">Fica na lista de laboratórios da ótica e já é escolhido nesta OS.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${rotulo} col-span-2`}>Nome<input id="oslab-nome" value={f.nome} onChange={mudar("nome")} className={`${campo} mt-1`} required autoFocus /></label>
          <label className={rotulo}>Telefone<input id="oslab-tel" value={f.telefone} onChange={mudar("telefone")} inputMode="tel" className={`${campo} mt-1`} /></label>
          <label className={rotulo}>Contato<input id="oslab-contato" value={f.contato} onChange={mudar("contato")} placeholder="quem atende lá" className={`${campo} mt-1`} /></label>
          <label className={`${rotulo} col-span-2`}>
            Prazo de entrega (dias)
            <input id="oslab-prazo" value={f.prazo} onChange={mudar("prazo")} inputMode="numeric" placeholder="ex.: 7" className={`${campo} mt-1`} />
            <span className="mt-1 block text-[11px] font-normal text-neutral-500">Com o prazo, a previsão de entrega da OS sai preenchida.</span>
          </label>
        </div>
        {erro && <p role="alert" className="mt-3 text-xs text-red-600">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancelar</button>
          <button disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? "Salvando…" : "Cadastrar e escolher"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
