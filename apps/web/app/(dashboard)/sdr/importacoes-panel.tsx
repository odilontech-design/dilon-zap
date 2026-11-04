"use client";

import { useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import { ImportarCsv } from "./importar-csv";
import {
  botaoPrimario,
  botaoSecundario,
  COR_STATUS_IMPORTACAO,
  COR_STATUS_LINHA,
  dataHora,
  formatarCnpj,
  formatarTelefone,
  ROTULO_CAMPO,
  ROTULO_CRITERIO_DE_DUPLICIDADE,
  ROTULO_STATUS_IMPORTACAO,
  ROTULO_STATUS_LINHA,
} from "./formatos-sdr";

type Importacao = {
  id: string;
  nomeArquivo: string;
  status: string;
  campanhaNome: string | null;
  totalLinhas: number;
  invalidas: number;
  importadas: number;
  atualizadas: number;
  duplicadas: number;
  falhas: number;
  pendentes: number;
  createdAt: string;
  criadoPorNome: string | null;
  erro: string | null;
};

type Linha = {
  id: string;
  numero: number;
  status: string;
  bruto: Record<string, string>;
  erros: string[];
  avisos: string[];
  duplicadaPor: string | null;
  mudancas: { campo: string; para: string }[] | null;
  conflitos: { campo: string; existente: string; arquivo: string }[] | null;
  suprimida: boolean;
  tentativas: number;
  erroProcessamento: string | null;
};

type Detalhe = Importacao & {
  trabalho: { status: string; tentativas: number; maxTentativas: number; erro: string | null } | null;
  linhas: { itens: Linha[]; total: number; pagina: number; tamanho: number };
  podeEscrever: boolean;
};

const ativa = (i: Importacao) => i.status === "PENDENTE" || i.status === "PROCESSANDO";

export function ImportacoesPanel({ podeEscrever, campanhas }: { podeEscrever: boolean; campanhas: { id: string; nome: string }[] }) {
  const { data, error, mutate } = useSWR<{ importacoes: Importacao[] }>("/api/sdr/importacoes", fetcher, {
    // Enquanto há importação andando, acompanha de perto.
    refreshInterval: (d) => (d?.importacoes.some(ativa) ? 3_000 : 0),
  });
  const [importando, setImportando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">O processamento roda em segundo plano, num serviço à parte. Pode fechar a tela.</p>
        {podeEscrever && (
          <button onClick={() => setImportando(true)} className={botaoPrimario}>
            Importar CSV
          </button>
        )}
      </div>
      {aviso && <p className="rounded-md bg-accent/5 px-3 py-2 text-sm text-accent">{aviso}</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Carregando...</p>}
      {data?.importacoes.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-500">Nenhuma importação ainda.</p>}
      {!!data?.importacoes.length && (
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Arquivo</th>
                <th className="text-left font-medium px-4 py-2">Situação</th>
                <th className="text-right font-medium px-4 py-2">Novas</th>
                <th className="text-right font-medium px-4 py-2">Completadas</th>
                <th className="text-right font-medium px-4 py-2">Duplicadas</th>
                <th className="text-right font-medium px-4 py-2">Inválidas</th>
                <th className="text-right font-medium px-4 py-2">Falhas</th>
              </tr>
            </thead>
            <tbody>
              {data.importacoes.map((i) => {
                const feitas = i.totalLinhas - i.pendentes;
                return (
                  <tr key={i.id} onClick={() => setAberta(i.id)} className="border-t border-neutral-100 cursor-pointer hover:bg-neutral-50 align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{i.nomeArquivo}</p>
                      <p className="text-[11px] text-neutral-500">
                        {dataHora(i.createdAt)}
                        {i.criadoPorNome ? ` · ${i.criadoPorNome}` : ""}
                        {i.campanhaNome ? ` · campanha ${i.campanhaNome}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS_IMPORTACAO[i.status] ?? ""}`}>{ROTULO_STATUS_IMPORTACAO[i.status] ?? i.status}</span>
                      {ativa(i) && i.totalLinhas > 0 && (
                        <div className="mt-1 h-1.5 w-28 rounded bg-neutral-100" role="progressbar" aria-valuenow={feitas} aria-valuemax={i.totalLinhas}>
                          <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round((100 * feitas) / i.totalLinhas)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.importadas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.atualizadas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.duplicadas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.invalidas}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${i.falhas ? "text-red-600 font-medium" : ""}`}>{i.falhas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {importando && (
        <ImportarCsv
          campanhas={campanhas}
          onFechar={() => setImportando(false)}
          onImportado={() => {
            setImportando(false);
            setAviso("Importação enviada. Ela entrou na fila e aparece aqui conforme é processada.");
            mutate();
          }}
        />
      )}
      {aberta && <DetalheDaImportacao id={aberta} onFechar={() => setAberta(null)} onMudou={() => mutate()} />}
    </div>
  );
}

const FILTROS: [string, string][] = [
  ["", "Todas"],
  ["INVALIDA", "Inválidas"],
  ["DUPLICADA", "Duplicadas"],
  ["ATUALIZADA", "Completadas"],
  ["CONFLITO", "Com divergência"],
  ["SUPRIMIDA", "Bloqueadas"],
  ["FALHOU", "Falhas"],
];

function DetalheDaImportacao({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [status, setStatus] = useState("");
  const [pagina, setPagina] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const url = `/api/sdr/importacoes/${id}?pagina=${pagina}${status ? `&status=${status}` : ""}`;
  const { data, error, mutate } = useSWR<Detalhe>(url, fetcher, {
    keepPreviousData: true,
    refreshInterval: (d) => (d && ativa(d) ? 3_000 : 0),
  });

  async function reprocessar() {
    setMsg(null);
    const r = await chamar(`/api/sdr/importacoes/${id}/reprocessar`, "POST");
    if (!r.ok) return setMsg(r.erro ?? "não deu para reprocessar");
    const d = r.dados as { jaNaFila: boolean; liberadas: number; pendentes: number };
    setMsg(d.jaNaFila ? "Já está na fila." : d.pendentes === 0 ? "Nada a reprocessar." : `${d.pendentes} linha(s) voltaram para a fila.`);
    mutate();
    onMudou();
  }

  const totalDePaginas = data ? Math.max(1, Math.ceil(data.linhas.total / data.linhas.tamanho)) : 1;
  const podeReprocessar = !!data?.podeEscrever && (data.falhas > 0 || data.status === "FALHOU" || data.pendentes > 0) && !ativa(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{data?.nomeArquivo ?? "Importação"}</h2>
            {data && (
              <p className="text-xs text-neutral-500">
                {dataHora(data.createdAt)}
                {data.campanhaNome ? ` · campanha ${data.campanhaNome}` : ""} · {data.totalLinhas} linhas
              </p>
            )}
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS_IMPORTACAO[data.status] ?? ""}`}>{ROTULO_STATUS_IMPORTACAO[data.status] ?? data.status}</span>
              {data.trabalho && (
                <span className="text-xs text-neutral-500">
                  Fila: {data.trabalho.status.toLowerCase().replace("_", " ")}, tentativa {data.trabalho.tentativas} de {data.trabalho.maxTentativas}
                </span>
              )}
              {podeReprocessar && (
                <button onClick={reprocessar} className={`${botaoSecundario} ml-auto`}>
                  Reprocessar
                </button>
              )}
            </div>
            {(data.erro || data.trabalho?.erro) && <p className="text-sm text-red-600">{data.erro ?? data.trabalho?.erro}</p>}
            {msg && <p className="text-sm text-accent">{msg}</p>}
            <p className="text-xs text-neutral-600 tabular-nums">
              {data.importadas} novas · {data.atualizadas} completadas · {data.duplicadas} duplicadas · {data.invalidas} inválidas · {data.falhas} falhas · {data.pendentes} aguardando
            </p>

            <div className="flex flex-wrap gap-1">
              {FILTROS.map(([valor, nome]) => (
                <button
                  key={valor}
                  onClick={() => {
                    setStatus(valor);
                    setPagina(1);
                  }}
                  aria-pressed={status === valor}
                  className={`rounded-full border px-2.5 py-1 text-xs ${status === valor ? "border-accent bg-accent/10 text-accent" : "border-neutral-300 text-neutral-600"}`}
                >
                  {nome}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-neutral-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-2 w-14">Linha</th>
                    <th className="text-left font-medium px-3 py-2">Empresa</th>
                    <th className="text-left font-medium px-3 py-2">Situação</th>
                    <th className="text-left font-medium px-3 py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.itens.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-neutral-400">
                        Nenhuma linha neste filtro.
                      </td>
                    </tr>
                  )}
                  {data.linhas.itens.map((l) => (
                    <tr key={l.id} className="border-t border-neutral-100 align-top">
                      <td className="px-3 py-2 tabular-nums text-neutral-500">{l.numero}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.bruto.razaoSocial || l.bruto.nomeFantasia || "(sem nome)"}</p>
                        <p className="text-[11px] text-neutral-500">{l.bruto.cnpj ? formatarCnpj(l.bruto.cnpj.replace(/\D/g, "")) || l.bruto.cnpj : "sem CNPJ"}</p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS_LINHA[l.status] ?? ""}`}>{ROTULO_STATUS_LINHA[l.status] ?? l.status}</span>
                        {l.suprimida && <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Bloqueada</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        <DetalheDaLinha l={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalDePaginas > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className={botaoSecundario}>
                  Anterior
                </button>
                <span>
                  {pagina} de {totalDePaginas}
                </span>
                <button disabled={pagina >= totalDePaginas} onClick={() => setPagina(pagina + 1)} className={botaoSecundario}>
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Telefone e CNPJ ficam guardados só com dígitos; na tela aparecem como a pessoa espera. */
const mostrar = (campo: string, valor: string) => (campo === "telefone" ? formatarTelefone(valor) : campo === "cnpj" ? formatarCnpj(valor) : valor);

function DetalheDaLinha({ l }: { l: Linha }) {
  const [codigo, base] = (l.duplicadaPor ?? "").split("|");
  return (
    <div className="flex flex-col gap-0.5">
      {l.erros.map((e) => (
        <span key={e} className="text-red-700">
          {e}
        </span>
      ))}
      {l.erroProcessamento && (
        <span className="text-red-700">
          {l.erroProcessamento} (tentativa {l.tentativas})
        </span>
      )}
      {l.duplicadaPor && (
        <span>
          {ROTULO_CRITERIO_DE_DUPLICIDADE[codigo] ?? codigo}, {base === "ARQUIVO" ? "repetida no próprio arquivo" : "já estava na base"}
        </span>
      )}
      {l.mudancas?.map((m) => (
        <span key={m.campo}>
          Preencheu {ROTULO_CAMPO[m.campo] ?? m.campo}: {mostrar(m.campo, m.para)}
        </span>
      ))}
      {l.conflitos?.map((c) => (
        <span key={c.campo} className="text-amber-800">
          {ROTULO_CAMPO[c.campo] ?? c.campo} diverge: na base “{mostrar(c.campo, c.existente)}”, no arquivo “{mostrar(c.campo, c.arquivo)}” (mantido o da base)
        </span>
      ))}
      {l.avisos.map((a) => (
        <span key={a} className="text-neutral-500">
          {a}
        </span>
      ))}
    </div>
  );
}
