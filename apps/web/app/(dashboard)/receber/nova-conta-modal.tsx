"use client";

import { useEffect, useMemo, useState } from "react";
import { gerarParcelas } from "@dilon-zap/receivables";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import { chamar, dataVencimento, hojeISO, ROTULO_TIPO } from "./formatos";

type Contato = { id: string; nome: string | null; telefone: string | null };
type Periodicidade = "SEMANAL" | "QUINZENAL" | "MENSAL";

const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/**
 * Nova conta a receber: o cliente, o valor total e como ele vai pagar —
 * entrada opcional e N parcelas semanais, quinzenais ou mensais. A prévia mostra
 * exatamente as parcelas que serão criadas, com os centavos já divididos.
 */
export function NovaContaModal({ onFechar, onCriada }: { onFechar: () => void; onCriada: () => void }) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Contato[]>([]);
  const [contato, setContato] = useState<Contato | null>(null);
  const [telefoneNovo, setTelefoneNovo] = useState("");

  const [descricao, setDescricao] = useState("");
  const [total, setTotal] = useState("");
  const [entrada, setEntrada] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("SEMANAL");
  const [primeiro, setPrimeiro] = useState(hojeISO());
  const [vencEntrada, setVencEntrada] = useState(hojeISO());

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (contato || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    // Espera a pessoa parar de digitar: uma consulta por tecla varreria os contatos a cada letra.
    const t = setTimeout(async () => {
      const res = await fetch(`/api/negociacoes/contatos?q=${encodeURIComponent(busca.trim())}`);
      if (res.ok) setAchados(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [busca, contato]);

  const totalCents = reaisParaCentavos(total);
  const entradaCents = entrada.trim() ? reaisParaCentavos(entrada) : 0;
  const n = Number(numParcelas);

  const previa = useMemo(() => {
    if (totalCents === null || totalCents <= 0 || entradaCents === null) return { erro: null as string | null, linhas: [] };
    if (!Number.isInteger(n) || n < 1) return { erro: "informe o número de parcelas", linhas: [] };
    try {
      return {
        erro: null,
        linhas: gerarParcelas({
          totalCents,
          entradaCents,
          numParcelas: n,
          periodicidade,
          primeiroVencimento: noon(primeiro),
          vencimentoEntrada: noon(vencEntrada),
        }),
      };
    } catch (e) {
      return { erro: (e as Error).message, linhas: [] };
    }
  }, [totalCents, entradaCents, n, periodicidade, primeiro, vencEntrada]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (totalCents === null || totalCents <= 0) return setErro("informe o valor total");
    if (entradaCents === null) return setErro("entrada inválida");
    if (previa.erro) return setErro(previa.erro);

    setSalvando(true);
    try {
      let contactId = contato?.id;
      if (!contactId) {
        if (telefoneNovo.replace(/\D/g, "").length < 8) return setErro("escolha um cliente ou digite um telefone");
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: telefoneNovo, name: busca.trim() || undefined }),
        });
        if (!res.ok) return setErro("não deu pra cadastrar o cliente");
        contactId = (await res.json()).id as string;
      }

      const r = await chamar("/api/contas-receber", "POST", {
        contactId,
        descricao: descricao.trim() || null,
        totalCents,
        entradaCents: entradaCents || undefined,
        vencimentoEntrada: entradaCents ? vencEntrada : undefined,
        numParcelas: n,
        periodicidade,
        primeiroVencimento: primeiro,
      });
      if (!r.ok) return setErro(r.erro ?? "não deu pra criar a conta");
      onCriada();
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={salvar} className="bg-surface rounded-lg p-6 w-full max-w-2xl shadow-lg max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-4">Nova conta a receber</h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Cliente</label>
            {contato ? (
              <div className="flex items-center justify-between rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <span className="truncate">{contato.nome || contato.telefone}</span>
                <button type="button" onClick={() => setContato(null)} className="text-xs text-accent hover:underline shrink-0">
                  trocar
                </button>
              </div>
            ) : (
              <>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className={campo} />
                {achados.length > 0 && (
                  <ul className="mt-1 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-40 overflow-y-auto">
                    {achados.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setContato(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50">
                          {c.nome || "Sem nome"} <span className="text-xs text-neutral-400">{c.telefone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {busca.trim().length >= 2 && achados.length === 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] text-neutral-500 mb-1">Não achei. Cadastre pelo telefone:</p>
                    <input value={telefoneNovo} onChange={(e) => setTelefoneNovo(e.target.value)} placeholder="DDD + número" inputMode="tel" className={campo} />
                  </div>
                )}
              </>
            )}
          </div>

          <label className="text-xs font-medium text-neutral-700">
            Descrição (opcional)
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: Venda de coloração, outubro" className={`${campo} mt-1`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Valor total (R$)
              <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Entrada (R$, opcional)
              <input value={entrada} onChange={(e) => setEntrada(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} mt-1`} />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Parcelas
              <input value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Periodicidade
              <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)} className={`${campo} mt-1`}>
                <option value="SEMANAL">Semanal</option>
                <option value="QUINZENAL">Quinzenal</option>
                <option value="MENSAL">Mensal</option>
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700">
              1º vencimento
              <input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} className={`${campo} mt-1`} />
            </label>
            {entradaCents ? (
              <label className="text-xs font-medium text-neutral-700">
                Vence a entrada
                <input type="date" value={vencEntrada} onChange={(e) => setVencEntrada(e.target.value)} className={`${campo} mt-1`} />
              </label>
            ) : null}
          </div>

          {previa.linhas.length > 0 && (
            <div className="rounded-md border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
                    <th className="text-left px-3 py-1.5 font-medium">Parcela</th>
                    <th className="text-left px-3 py-1.5 font-medium">Vencimento</th>
                    <th className="text-right px-3 py-1.5 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-1.5">{ROTULO_TIPO[p.tipo]}</td>
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
