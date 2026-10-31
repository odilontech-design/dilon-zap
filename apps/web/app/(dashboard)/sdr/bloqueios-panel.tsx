"use client";

import { useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import { botaoPrimario, botaoSecundario, campo, dataHora, ROTULO_MOTIVO_SUPRESSAO, ROTULO_TIPO_SUPRESSAO, rotulo } from "./formatos-sdr";

type Supressao = { id: string; tipo: string; valor: string; motivo: string; observacao: string | null; criadoPorNome: string | null; createdAt: string };

const DICAS: Record<string, string> = {
  CNPJ: "14 caracteres, com ou sem máscara",
  DOMINIO: "empresa.com.br (vale para o site e para o e-mail da empresa)",
  EMAIL: "pessoa@empresa.com.br",
  TELEFONE: "(11) 99999-8888",
};

export function BloqueiosPanel({ podeEscrever, verEmpresasBloqueadas }: { podeEscrever: boolean; verEmpresasBloqueadas: () => void }) {
  const { data, error, mutate } = useSWR<{ supressoes: Supressao[] }>("/api/sdr/supressoes", fetcher);
  const [tipo, setTipo] = useState("CNPJ");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("EMPRESA_BLOQUEADA");
  const [observacao, setObservacao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setFalha(null);
    setMsg(null);
    setSalvando(true);
    const r = await chamar("/api/sdr/supressoes", "POST", { tipo, valor, motivo, observacao: observacao.trim() || null });
    setSalvando(false);
    if (!r.ok) return setFalha(r.erro ?? "não deu para adicionar");
    setValor("");
    setObservacao("");
    setMsg("Adicionado. Vale na hora para todas as empresas, inclusive as já importadas.");
    mutate();
  }

  async function remover(s: Supressao) {
    setFalha(null);
    setMsg(null);
    const r = await chamar(`/api/sdr/supressoes/${s.id}`, "DELETE");
    if (!r.ok) return setFalha(r.erro ?? "não deu para remover");
    mutate();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        Quem está aqui nunca deve ser prospectado. A lista é consultada antes de qualquer etapa de contato e vale para empresas já importadas e para as próximas.
      </p>

      {podeEscrever && (
        <form onSubmit={adicionar} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface p-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <label>
              <span className={rotulo}>O que bloquear</span>
              <select id="supressao-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
                {Object.entries(ROTULO_TIPO_SUPRESSAO).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className={rotulo}>Valor</span>
              <input id="supressao-valor" value={valor} onChange={(e) => setValor(e.target.value)} required maxLength={200} placeholder={DICAS[tipo]} className={campo} />
            </label>
            <label>
              <span className={rotulo}>Motivo</span>
              <select id="supressao-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}>
                {Object.entries(ROTULO_MOTIVO_SUPRESSAO).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span className={rotulo}>Observação (opcional)</span>
            <input id="supressao-observacao" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: pediu por e-mail em 12/11" className={campo} />
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={salvando || !valor.trim()} className={botaoPrimario}>
              Adicionar à lista
            </button>
          </div>
        </form>
      )}

      {msg && <p className="rounded-md bg-accent/5 px-3 py-2 text-sm text-accent">{msg}</p>}
      {falha && <p className="text-sm text-red-600">{falha}</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Lista de supressão {data ? `(${data.supressoes.length})` : ""}</h3>
        <button onClick={verEmpresasBloqueadas} className={`${botaoSecundario} py-1 text-xs`}>
          Ver empresas bloqueadas
        </button>
      </div>
      {!data && !error && <p className="text-sm text-neutral-400">Carregando...</p>}
      {data?.supressoes.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-500">A lista está vazia.</p>}
      {!!data?.supressoes.length && (
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Tipo</th>
                <th className="text-left font-medium px-3 py-2">Valor</th>
                <th className="text-left font-medium px-3 py-2">Motivo</th>
                <th className="text-left font-medium px-3 py-2">Quem e quando</th>
                {podeEscrever && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {data.supressoes.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2">{ROTULO_TIPO_SUPRESSAO[s.tipo] ?? s.tipo}</td>
                  <td className="px-3 py-2 break-all">{s.valor}</td>
                  <td className="px-3 py-2">
                    {ROTULO_MOTIVO_SUPRESSAO[s.motivo] ?? s.motivo}
                    {s.observacao && <p className="text-[11px] text-neutral-500">{s.observacao}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {s.criadoPorNome ?? "—"}
                    <br />
                    {dataHora(s.createdAt)}
                  </td>
                  {podeEscrever && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remover(s)} className="text-xs text-neutral-500 hover:text-red-600">
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
