"use client";

import { useState } from "react";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import { chamar, hojeISO, type MeioPagamento } from "./formatos";

const MEIOS: { valor: MeioPagamento; rotulo: string }[] = [
  { valor: "PIX", rotulo: "PIX" },
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
  { valor: "CARTAO", rotulo: "Cartão" },
  { valor: "BOLETO", rotulo: "Boleto" },
  { valor: "FIADO", rotulo: "Outro" },
];

/**
 * Registra o recebimento de uma parcela. O valor padrão é o que falta dela;
 * receber mais que isso quita as seguintes, e receber menos deixa o resto em aberto.
 */
export function ReceberModal({
  parcelaId,
  titulo,
  saldoCents,
  onFechar,
  onRecebido,
}: {
  parcelaId: string;
  titulo: string;
  saldoCents: number;
  onFechar: () => void;
  onRecebido: () => void;
}) {
  const [valor, setValor] = useState((saldoCents / 100).toFixed(2).replace(".", ","));
  const [meio, setMeio] = useState<MeioPagamento>("PIX");
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (cents === null || cents <= 0) return setErro("informe um valor válido");
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/parcelas/${parcelaId}`, "PATCH", {
      acao: "receber",
      valorCents: cents,
      meio,
      recebidoEm: data,
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra registrar");
    onRecebido();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-1">Receber</h2>
        <p className="text-xs text-neutral-500 mb-4">{titulo} · falta {centsToBRL(saldoCents)}</p>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Valor recebido (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoFocus className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Forma
              <select value={meio} onChange={(e) => setMeio(e.target.value as MeioPagamento)} className={`${campo} mt-1`}>
                {MEIOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Recebido em
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${campo} mt-1`} />
            </label>
          </div>
          <label className="text-xs font-medium text-neutral-700">
            Observação (opcional)
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? "Salvando..." : "Registrar recebimento"}
          </button>
        </div>
      </form>
    </div>
  );
}
