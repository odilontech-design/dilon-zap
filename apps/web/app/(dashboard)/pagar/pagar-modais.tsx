"use client";

import { useEffect, useMemo, useState } from "react";
import { gerarParcelas } from "@dilon-zap/receivables";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import { chamar, dataVencimento, hojeISO } from "../receber/formatos";

export type FormaPagar = "BOLETO" | "PIX" | "TRANSFERENCIA" | "CARTAO" | "DINHEIRO" | "CHEQUE" | "OUTRO";

export const ROTULO_FORMA: Record<FormaPagar, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  CHEQUE: "Cheque",
  OUTRO: "Outro",
};

const FORMAS = Object.keys(ROTULO_FORMA) as FormaPagar[];
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);
const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-50";

type Fornecedor = { id: string; nome: string };

/** Escolhe um fornecedor existente (busca) ou digita um novo: o nome novo vira cadastro ao salvar. */
export function EscolherFornecedor({ valor, onChange }: { valor: { id: string | null; nome: string }; onChange: (v: { id: string | null; nome: string }) => void }) {
  const [achados, setAchados] = useState<Fornecedor[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    // Espera a pessoa parar de digitar.
    const t = setTimeout(async () => {
      const res = await fetch(`/api/fornecedores?q=${encodeURIComponent(valor.nome.trim())}`);
      if (res.ok) setAchados(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [valor.nome, aberto]);

  return (
    <div className="relative">
      <input
        value={valor.nome}
        onChange={(e) => {
          // Digitar de novo solta o vínculo: o que vale é o que está escrito.
          onChange({ id: null, nome: e.target.value });
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Digite o fornecedor"
        className={campo}
      />
      {aberto && achados.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-neutral-200 bg-surface shadow max-h-48 overflow-y-auto">
          {achados.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: f.id, nome: f.nome });
                  setAberto(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
              >
                {f.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      {valor.nome.trim() && !valor.id && <p className="text-[11px] text-neutral-400 mt-1">Fornecedor novo: será cadastrado ao salvar.</p>}
    </div>
  );
}

export function NovaContaPagarModal({ onFechar, onCriada }: { onFechar: () => void; onCriada: () => void }) {
  const [fornecedor, setFornecedor] = useState<{ id: string | null; nome: string }>({ id: null, nome: "" });
  const [descricao, setDescricao] = useState("");
  const [total, setTotal] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [periodicidade, setPeriodicidade] = useState<"SEMANAL" | "QUINZENAL" | "MENSAL">("MENSAL");
  const [primeiro, setPrimeiro] = useState(hojeISO());
  const [forma, setForma] = useState<FormaPagar>("BOLETO");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const totalCents = reaisParaCentavos(total);
  const n = Number(numParcelas);

  const previa = useMemo(() => {
    if (totalCents === null || totalCents <= 0) return { erro: null as string | null, linhas: [] };
    if (!Number.isInteger(n) || n < 1) return { erro: "informe o número de parcelas", linhas: [] };
    try {
      return { erro: null, linhas: gerarParcelas({ totalCents, numParcelas: n, periodicidade, primeiroVencimento: noon(primeiro) }) };
    } catch (e) {
      return { erro: (e as Error).message, linhas: [] };
    }
  }, [totalCents, n, periodicidade, primeiro]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!fornecedor.nome.trim()) return setErro("informe o fornecedor");
    if (totalCents === null || totalCents <= 0) return setErro("informe o valor total");
    if (previa.erro) return setErro(previa.erro);

    setSalvando(true);
    const r = await chamar("/api/contas-pagar", "POST", {
      ...(fornecedor.id ? { fornecedorId: fornecedor.id } : { fornecedorNome: fornecedor.nome.trim() }),
      descricao: descricao.trim() || null,
      totalCents,
      numParcelas: n,
      periodicidade,
      primeiroVencimento: primeiro,
      forma,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra criar a conta");
    onCriada();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={salvar} className="bg-surface rounded-lg p-6 w-full max-w-2xl shadow-lg max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-4">Nova conta a pagar</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Fornecedor</label>
            <EscolherFornecedor valor={fornecedor} onChange={setFornecedor} />
          </div>
          <label className="text-xs font-medium text-neutral-700">
            Descrição (opcional)
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: NF 1234, reposição de estoque" className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Valor total (R$)
              <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Parcelas
              <input value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Periodicidade
              <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)} className={`${campo} mt-1`}>
                <option value="SEMANAL">Semanal</option>
                <option value="QUINZENAL">Quinzenal</option>
                <option value="MENSAL">Mensal</option>
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700">
              1º vencimento
              <input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} className={`${campo} mt-1`} />
            </label>
          </div>
          <label className="text-xs font-medium text-neutral-700 sm:w-1/2">
            Tipo de pagamento
            <select value={forma} onChange={(e) => setForma(e.target.value as FormaPagar)} className={`${campo} mt-1`}>
              {FORMAS.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FORMA[f]}
                </option>
              ))}
            </select>
          </label>

          {previa.linhas.length > 0 && (
            <div className="rounded-md border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Parcela</th>
                    <th className="text-left px-3 py-1.5 font-medium">Vencimento</th>
                    <th className="text-right px-3 py-1.5 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-1.5">
                        {p.numero} de {p.totalParcelas}
                      </td>
                      <td className="px-3 py-1.5">{dataVencimento(p.vencimento.toISOString())}</td>
                      <td className="px-3 py-1.5 text-right">{centsToBRL(p.valorCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {previa.erro && totalCents ? <p className="text-xs text-amber-700">{previa.erro}</p> : null}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? "Salvando..." : "Criar conta"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Registra o pagamento de uma parcela. Em dinheiro, sai da gaveta do caixa aberto. */
export function PagarModal({ parcelaId, titulo, saldoCents, formaPrevista, onFechar, onPago }: { parcelaId: string; titulo: string; saldoCents: number; formaPrevista: FormaPagar; onFechar: () => void; onPago: () => void }) {
  const [valor, setValor] = useState((saldoCents / 100).toFixed(2).replace(".", ","));
  const [meio, setMeio] = useState<FormaPagar>(formaPrevista);
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
    const r = await chamar(`/api/parcelas-pagar/${parcelaId}`, "PATCH", { acao: "pagar", valorCents: cents, meio, pagoEm: data, ...(observacao.trim() ? { observacao: observacao.trim() } : {}) });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra registrar");
    onPago();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-1">Pagar</h2>
        <p className="text-xs text-neutral-500 mb-4">
          {titulo} · falta {centsToBRL(saldoCents)}
        </p>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Valor pago (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoFocus className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Forma
              <select value={meio} onChange={(e) => setMeio(e.target.value as FormaPagar)} className={`${campo} mt-1`}>
                {FORMAS.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Pago em
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${campo} mt-1`} />
            </label>
          </div>
          {meio === "DINHEIRO" && <p className="text-[11px] text-neutral-500">Em dinheiro: sai da gaveta e entra na conferência do caixa aberto.</p>}
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
            {salvando ? "Salvando..." : "Registrar pagamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function EditarParcelaPagarModal({ parcela, onFechar, onSalvo }: { parcela: { id: string; vencimento: string | null; valorCents: number; forma: FormaPagar; observacao: string | null }; onFechar: () => void; onSalvo: () => void }) {
  const [vencimento, setVencimento] = useState(parcela.vencimento ? parcela.vencimento.slice(0, 10) : "");
  const [valor, setValor] = useState((parcela.valorCents / 100).toFixed(2).replace(".", ","));
  const [forma, setForma] = useState<FormaPagar>(parcela.forma);
  const [observacao, setObservacao] = useState(parcela.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (cents === null || cents <= 0) return setErro("valor inválido");
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/parcelas-pagar/${parcela.id}`, "PATCH", {
      acao: "editar",
      vencimento: vencimento || null,
      forma,
      observacao: observacao.trim() || null,
      ...(cents !== parcela.valorCents ? { valorCents: cents } : {}),
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra salvar");
    onSalvo();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">Editar parcela</h2>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Vencimento
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Valor (R$)
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Tipo de pagamento
              <select value={forma} onChange={(e) => setForma(e.target.value as FormaPagar)} className={`${campo} mt-1`}>
                {FORMAS.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs font-medium text-neutral-700">
            Observação
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

export function ReparcelarPagarModal({ contaId, totalRestanteCents, onFechar, onSalvo }: { contaId: string; totalRestanteCents: number; onFechar: () => void; onSalvo: () => void }) {
  const [numParcelas, setNumParcelas] = useState("2");
  const [periodicidade, setPeriodicidade] = useState<"SEMANAL" | "QUINZENAL" | "MENSAL">("MENSAL");
  const [primeiro, setPrimeiro] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const n = Number(numParcelas);

  const previa = useMemo(() => {
    if (!Number.isInteger(n) || n < 1) return { erro: null as string | null, linhas: [] };
    try {
      return { erro: null, linhas: gerarParcelas({ totalCents: totalRestanteCents, numParcelas: n, periodicidade, primeiroVencimento: noon(primeiro) }) };
    } catch (e) {
      return { erro: (e as Error).message, linhas: [] };
    }
  }, [n, periodicidade, primeiro, totalRestanteCents]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (previa.erro) return setErro(previa.erro);
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/contas-pagar/${contaId}`, "PATCH", { acao: "reparcelar", numParcelas: n, periodicidade, primeiroVencimento: primeiro });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra reparcelar");
    onSalvo();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-md shadow-lg max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-1">Reparcelar</h2>
        <p className="text-xs text-neutral-500 mb-4">Refaz as parcelas sem pagamento: {centsToBRL(totalRestanteCents)} a dividir.</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Parcelas
            <input value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Periodicidade
            <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)} className={`${campo} mt-1`}>
              <option value="SEMANAL">Semanal</option>
              <option value="QUINZENAL">Quinzenal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-700">
            1º vencimento
            <input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} className={`${campo} mt-1`} />
          </label>
        </div>
        {previa.linhas.length > 0 && (
          <ul className="mt-4 rounded-md border border-neutral-200 divide-y divide-neutral-100 text-sm tabular-nums">
            {previa.linhas.map((p, i) => (
              <li key={i} className="flex justify-between px-3 py-1.5">
                <span>
                  {p.numero} de {p.totalParcelas} · {dataVencimento(p.vencimento.toISOString())}
                </span>
                <span>{centsToBRL(p.valorCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {(previa.erro || erro) && <p className="text-sm text-red-600 mt-3">{previa.erro ?? erro}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Reparcelar
          </button>
        </div>
      </form>
    </div>
  );
}
