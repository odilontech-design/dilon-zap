"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { PRAZOS, lerPercentual, lerReais, simular, textoDaSimulacao } from "@/lib/financiamento";
import { placaParaTela } from "@/lib/veiculos-regras";

type Carro = { id: string; placa: string | null; marca: string; modelo: string; versao: string | null; anoFabricacao: number; anoModelo: number; precoCents: number; status: string };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { veiculos: [] }));
const CHAVE_DA_TAXA = "simulador-taxa-mensal";
const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-1.5 text-sm";

const nomeDoCarro = (c: Carro) => `${c.marca} ${c.modelo}${c.versao ? ` ${c.versao}` : ""} ${c.anoFabricacao}/${c.anoModelo}`;
const emReais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Simulador de financiamento do vendedor: uma ESTIMATIVA com a taxa que ele digita (a do banco da loja). Não aprova
 * crédito. O texto para o cliente diz isso e mostra a taxa usada. A taxa fica lembrada neste navegador.
 */
export function SimuladorDeFinanciamento({ onFechar, onUsarTexto }: { onFechar: () => void; onUsarTexto: (texto: string) => void }) {
  const { data } = useSWR<{ veiculos: Carro[] }>("/api/veiculos", fetcher);
  const [carroId, setCarroId] = useState("");
  const [preco, setPreco] = useState("");
  const [entrada, setEntrada] = useState("");
  const [taxa, setTaxa] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(CHAVE_DA_TAXA);
      if (t) setTaxa(t);
    } catch {
      /* sem armazenamento: o campo fica em branco */
    }
  }, []);

  const carros = useMemo(() => (data?.veiculos ?? []).filter((c) => c.status === "DISPONIVEL" || c.status === "RESERVADO").sort((a, b) => a.precoCents - b.precoCents), [data]);
  const carro = carros.find((c) => c.id === carroId) ?? null;
  const precoCents = lerReais(preco);
  const entradaCents = lerReais(entrada);
  const sim = simular({ precoCents, entradaCents, taxaMensalPct: lerPercentual(taxa) });
  const mostrouErro = precoCents > 0 && (entrada.trim() !== "" || taxa.trim() !== "");

  function escolher(id: string) {
    setCarroId(id);
    const c = carros.find((x) => x.id === id);
    if (c) setPreco(emReais(c.precoCents));
  }
  function guardarTaxa(v: string) {
    setTaxa(v);
    try {
      window.localStorage.setItem(CHAVE_DA_TAXA, v);
    } catch {
      /* sem armazenamento: só não lembra da próxima vez */
    }
  }
  const texto = sim.ok ? textoDaSimulacao({ carro: carro ? nomeDoCarro(carro) : null, precoCents, entradaCents, taxaMensalPct: lerPercentual(taxa), financiadoCents: sim.financiadoCents, linhas: sim.linhas }) : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-neutral-200 bg-surface" data-testid="simulador-financiamento">
        <header className="flex items-center justify-between border-b border-neutral-200 p-4">
          <h2 className="font-semibold">Simular financiamento</h2>
          <button onClick={onFechar} className="text-sm text-neutral-500 hover:text-neutral-800">
            fechar
          </button>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            Carro (opcional: preenche o valor)
            <select value={carroId} onChange={(e) => escolher(e.target.value)} className={campo} id="sim-carro">
              <option value="">Digitar o valor</option>
              {carros.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeDoCarro(c)} · {centsToBRL(c.precoCents)}
                  {c.placa ? ` · ${placaParaTela(c.placa)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              Valor do carro (R$)
              <input id="sim-preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              Entrada (R$)
              <input id="sim-entrada" inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0,00" className={campo} />
            </label>
          </div>
          {precoCents > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              Entrada de:
              {[20, 30, 40, 50].map((p) => (
                <button key={p} type="button" onClick={() => setEntrada(emReais(Math.round((precoCents * p) / 100)))} className="rounded border border-neutral-300 px-2 py-0.5 hover:border-accent">
                  {p}%
                </button>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            Taxa de juros ao mês (%), a que o banco da loja pratica
            <input id="sim-taxa" inputMode="decimal" value={taxa} onChange={(e) => guardarTaxa(e.target.value)} placeholder="ex.: 1,8" className={campo} />
          </label>

          {sim.ok ? (
            <>
              <p className="text-sm">
                Valor financiado: <b>{centsToBRL(sim.financiadoCents)}</b>
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 font-normal">Prazo</th>
                    <th className="text-right font-normal">Parcela</th>
                    <th className="text-right font-normal">Total pago</th>
                    <th className="text-right font-normal">Juros</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.linhas.map((l) => (
                    <tr key={l.meses} className="border-t border-neutral-100">
                      <td className="py-1.5">{l.meses}x</td>
                      <td className="text-right font-medium tabular-nums">{centsToBRL(l.parcelaCents)}</td>
                      <td className="text-right tabular-nums">{centsToBRL(l.totalPagoCents)}</td>
                      <td className="text-right tabular-nums text-neutral-500">{centsToBRL(l.jurosCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] leading-snug text-neutral-500">Estimativa pela tabela Price ({PRAZOS.join(", ")} meses). Não é aprovação de crédito: IOF, tarifas, seguro e a taxa final do banco mudam o valor.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUsarTexto(texto);
                  }}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Usar no campo da conversa
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(texto);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2000);
                    } catch {
                      /* sem permissão da área de transferência */
                    }
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-accent"
                >
                  {copiado ? "Copiado ✓" : "Copiar texto"}
                </button>
              </div>
            </>
          ) : (
            <p className={`text-sm ${mostrouErro ? "text-red-600" : "text-neutral-500"}`} data-testid="simulador-aviso">
              {mostrouErro ? sim.erro : "Preencha o valor, a entrada e a taxa para ver as parcelas."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
