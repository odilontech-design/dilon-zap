"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { reaisParaCentavos } from "../funil/tipos";
import { erroDaResposta } from "./formatos";

/**
 * Cadastro e edição de uma armação sem sair da OS (pedido da Visuallis): a atendente está abrindo a OS, a
 * armação do cliente não está no estoque, ou o preço ou a medida da etiqueta está errado, e antes ela tinha de
 * largar a OS, ir à tela de Armações e voltar. Mesmas rotas e mesmas regras da tela de Armações; só muda o
 * lugar. O que foi salvo volta para a OS, que já seleciona a peça.
 */

export type ArmacaoDados = {
  id: string;
  codigo: string;
  descricao: string;
  marca: string | null;
  cor: string | null;
  material: string | null;
  medidas: string | null;
  custoCents: number | null;
  precoCents: number | null;
  quantidade: number;
};

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const rotulo = "text-xs font-medium text-neutral-700";

const emReais = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function FormularioArmacao({
  armacaoId,
  codigoInicial,
  onSalvo,
  onFechar,
}: {
  /** Preenchido = edição desta armação; vazio = cadastro de uma nova. */
  armacaoId?: string;
  /** No cadastro, o que a pessoa já tinha digitado na busca vira o código. */
  codigoInicial?: string;
  onSalvo: (a: ArmacaoDados) => void;
  onFechar: () => void;
}) {
  const editando = !!armacaoId;
  const [f, setF] = useState({ codigo: codigoInicial ?? "", descricao: "", marca: "", cor: "", material: "", medidas: "", custo: "", preco: "", quantidade: "1" });
  const [carregando, setCarregando] = useState(editando);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Na edição, traz a peça inteira (a OS só guarda código, modelo e preço).
  useEffect(() => {
    if (!armacaoId) return;
    (async () => {
      // A rota de lista aceita busca por código; a peça escolhida na OS sempre existe.
      const cod = codigoInicial ?? "";
      const r = await fetch(`/api/otica/armacoes?limite=50&q=${encodeURIComponent(cod)}`);
      const itens = r.ok ? ((await r.json()).itens as ArmacaoDados[]) : [];
      const a = itens.find((x) => x.id === armacaoId);
      if (!a) {
        setErro("Não achei essa armação para editar. Feche e tente de novo.");
      } else {
        setF({
          codigo: a.codigo,
          descricao: a.descricao,
          marca: a.marca ?? "",
          cor: a.cor ?? "",
          material: a.material ?? "",
          medidas: a.medidas ?? "",
          custo: emReais(a.custoCents),
          preco: emReais(a.precoCents),
          quantidade: String(a.quantidade),
        });
      }
      setCarregando(false);
    })().catch(() => {
      setErro("Não deu para carregar a armação. Confira a internet e tente de novo.");
      setCarregando(false);
    });
  }, [armacaoId, codigoInicial]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    // O formulário da OS é o pai deste na árvore do React: sem isto o envio daqui subiria e tentaria salvar a OS.
    e.stopPropagation();
    setErro(null);
    const custo = f.custo.trim() ? reaisParaCentavos(f.custo) : null;
    const preco = f.preco.trim() ? reaisParaCentavos(f.preco) : null;
    if (custo === null && f.custo.trim()) return setErro("Confira o custo.");
    if (preco === null && f.preco.trim()) return setErro("Confira o preço.");
    setSalvando(true);
    try {
      const dados = { codigo: f.codigo, descricao: f.descricao, marca: f.marca, cor: f.cor, material: f.material, medidas: f.medidas, custoCents: custo, precoCents: preco };
      const r = await fetch(editando ? `/api/otica/armacoes/${armacaoId}` : "/api/otica/armacoes", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editando ? dados : { ...dados, quantidade: Number(f.quantidade || 1) }),
      });
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("application/json")) return setErro("Sua sessão expirou. Entre de novo; nada foi salvo.");
      if (!r.ok) return setErro(await erroDaResposta(r));
      const j = await r.json();
      const a = (editando ? j.armacao : j) as ArmacaoDados | null;
      if (!a) return setErro("Nada mudou.");
      onSalvo(a);
    } catch {
      setErro("Sem conexão com o servidor. Nada foi salvo; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  // Num portal: este formulário é aberto de dentro do formulário da OS, e <form> dentro de <form> não vale em HTML.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={editando ? "Editar armação" : "Cadastrar armação"}>
      <form onSubmit={salvar} className="bg-surface rounded-lg p-5 w-full max-w-xl shadow-lg max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-1">{editando ? "Editar armação" : "Cadastrar armação nova"}</h2>
        <p className="text-xs text-neutral-500 mb-4">
          {editando ? "Muda o cadastro no estoque. A OS continua com esta peça." : "Entra no estoque e já fica escolhida nesta OS."}
        </p>
        {carregando ? (
          <p className="text-sm text-neutral-500 py-6">Carregando…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>Código da etiqueta<input id="osarm-codigo" value={f.codigo} onChange={mudar("codigo")} className={`${campo} mt-1`} required autoFocus={!editando} /></label>
            <label className={rotulo}>Modelo<input id="osarm-desc" value={f.descricao} onChange={mudar("descricao")} placeholder="ex.: Acetato preta redonda" className={`${campo} mt-1`} required autoFocus={editando || !!codigoInicial} /></label>
            <label className={rotulo}>Marca<input id="osarm-marca" value={f.marca} onChange={mudar("marca")} className={`${campo} mt-1`} /></label>
            <label className={rotulo}>Cor<input id="osarm-cor" value={f.cor} onChange={mudar("cor")} className={`${campo} mt-1`} /></label>
            <label className={rotulo}>Material<input id="osarm-material" value={f.material} onChange={mudar("material")} placeholder="Acetato, Metal..." className={`${campo} mt-1`} /></label>
            <label className={rotulo}>Medidas<input id="osarm-medidas" value={f.medidas} onChange={mudar("medidas")} placeholder="52□19-145" className={`${campo} mt-1`} /></label>
            <label className={rotulo}>Custo (R$)<input id="osarm-custo" value={f.custo} onChange={mudar("custo")} inputMode="decimal" className={`${campo} mt-1`} /></label>
            <label className={rotulo}>Preço (R$)<input id="osarm-preco" value={f.preco} onChange={mudar("preco")} inputMode="decimal" className={`${campo} mt-1`} /></label>
            {!editando && (
              <label className={rotulo}>Quantidade<input id="osarm-qtd" value={f.quantidade} onChange={mudar("quantidade")} inputMode="numeric" className={`${campo} mt-1`} /></label>
            )}
          </div>
        )}
        {erro && <p role="alert" className="mt-3 text-xs text-red-600">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancelar</button>
          <button disabled={salvando || carregando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar e escolher"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
