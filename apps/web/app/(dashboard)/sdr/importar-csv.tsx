"use client";

import { useRef, useState } from "react";
import { chamar } from "../receber/formatos";
import { botaoPrimario, botaoSecundario, CAMPOS_DO_ARQUIVO, campo, campoPequeno, ROTULO_CAMPO, ROTULO_CRITERIO_DE_DUPLICIDADE, rotulo } from "./formatos-sdr";

type Previa = {
  cabecalho: string[];
  mapeamento: Record<string, string | null>;
  sugerido: boolean;
  problemas: string[];
  totais: { linhas: number; novas: number; atualizacoes: number; duplicadas: number; invalidas: number; suprimidas: number; comAviso: number };
  invalidas: { numero: number; erros: string[] }[];
  duplicadas: { numero: number; nome: string; por: string; noArquivo: boolean; mudancas: number; conflitos: number }[];
  novas: { numero: number; nome: string; cnpj: string | null; avisos: string[] }[];
  arquivoJaImportado: { id: string; criadaEm: string } | null;
};

type CampanhaResumo = { id: string; nome: string };

/** O Excel costuma salvar em Windows-1252. Tenta UTF-8 e, se não for, lê como Windows-1252. */
async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const LIMITE_BYTES = 5 * 1024 * 1024;

/**
 * Importar CSV em três passos: escolher o arquivo, conferir a prévia (e ajustar
 * as colunas) e confirmar. A prévia não grava nada. Ao confirmar, o servidor lê
 * o arquivo de novo: nada que a prévia mostrou é confiado.
 */
export function ImportarCsv({ campanhas, onFechar, onImportado }: { campanhas: CampanhaResumo[]; onFechar: () => void; onImportado: () => void }) {
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string | null> | null>(null);
  const [campanhaId, setCampanhaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // A mesma chave em todo envio desta janela: duplo clique não importa duas vezes.
  const chave = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random());

  async function gerarPrevia(texto: string, mapa: Record<string, string | null> | null) {
    setOcupado(true);
    setErro(null);
    const r = await chamar("/api/sdr/importacoes/previa", "POST", { conteudo: texto, ...(mapa ? { mapeamento: mapa } : {}) });
    setOcupado(false);
    if (!r.ok) return setErro(r.erro ?? "não deu para ler o arquivo");
    const p = r.dados as Previa;
    setPrevia(p);
    setMapeamento(p.mapeamento);
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setPrevia(null);
    if (arquivo.size > LIMITE_BYTES) return setErro("o arquivo passa de 5 MB");
    const texto = await lerArquivo(arquivo);
    setNomeArquivo(arquivo.name);
    setConteudo(texto);
    await gerarPrevia(texto, null);
  }

  async function trocarColuna(campoDoSistema: string, coluna: string) {
    if (!mapeamento || conteudo === null) return;
    const novo = { ...mapeamento, [campoDoSistema]: coluna || null };
    setMapeamento(novo);
    await gerarPrevia(conteudo, novo);
  }

  async function confirmar() {
    if (conteudo === null || !mapeamento) return;
    setOcupado(true);
    setErro(null);
    const r = await chamar("/api/sdr/importacoes", "POST", { nomeArquivo, conteudo, mapeamento, campanhaId: campanhaId || null, chave: chave.current });
    setOcupado(false);
    if (!r.ok) return setErro(r.erro ?? "não deu para importar");
    onImportado();
  }

  const t = previa?.totais;
  const aProcessar = t ? t.novas + t.atualizacoes + t.duplicadas : 0;
  const podeConfirmar = !!previa && previa.problemas.length === 0 && aProcessar > 0 && !ocupado;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Importar empresas de um CSV</h2>
            <p className="text-xs text-neutral-500">Só organiza o que está no arquivo. Nada é pesquisado, enviado ou criado no CRM.</p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>

        <label>
          <span className={rotulo}>Arquivo CSV (com cabeçalho, até 5 MB)</span>
          <input id="importar-arquivo" type="file" accept=".csv,.txt,text/csv" disabled={ocupado} onChange={(e) => escolher(e.target.files?.[0])} />
        </label>

        {ocupado && <p className="text-sm text-neutral-400">Processando…</p>}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {previa && mapeamento && (
          <>
            {previa.problemas.map((p) => (
              <p key={p} className="text-sm text-red-600">
                {p}
              </p>
            ))}

            <details open={previa.problemas.length > 0 || previa.sugerido} className="rounded-md border border-neutral-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">Colunas do arquivo</summary>
              <p className="text-xs text-neutral-500 mt-1">Confira qual coluna é cada informação. Colunas sem ligação não são lidas nem guardadas.</p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CAMPOS_DO_ARQUIVO.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 text-xs text-neutral-600">{ROTULO_CAMPO[c]}</span>
                    <select
                      id={`coluna-${c}`}
                      value={mapeamento[c] ?? ""}
                      disabled={ocupado}
                      onChange={(e) => trocarColuna(c, e.target.value)}
                      className={`${campoPequeno} flex-1 min-w-0`}
                    >
                      <option value="">(o arquivo não tem)</option>
                      {previa.cabecalho.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>

            {t && previa.problemas.length === 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Cartao titulo="Novas" valor={t.novas} destaque />
                  <Cartao titulo="Completam empresas" valor={t.atualizacoes} dica="Já existem; só os campos vazios seriam preenchidos" />
                  <Cartao titulo="Duplicadas" valor={t.duplicadas} dica="Já existem e não trazem nada novo" />
                  <Cartao titulo="Inválidas" valor={t.invalidas} perigo={t.invalidas > 0} />
                  <Cartao titulo="Bloqueadas" valor={t.suprimidas} dica="Estão na lista de supressão" />
                </div>
                <p className="text-xs text-neutral-500">
                  {t.linhas} linhas no arquivo{t.comAviso ? `; ${t.comAviso} com algum aviso (sem CNPJ, ou campo opcional inválido que foi ignorado)` : ""}.
                </p>

                {previa.arquivoJaImportado && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Este mesmo arquivo já foi importado em {new Date(previa.arquivoJaImportado.criadaEm).toLocaleString("pt-BR")}. Importar de novo só vai
                    gerar duplicadas.
                  </p>
                )}

                {previa.invalidas.length > 0 && (
                  <Amostra titulo={`Linhas inválidas (${t.invalidas}, mostrando ${previa.invalidas.length})`}>
                    {previa.invalidas.map((l) => (
                      <li key={l.numero}>
                        <strong className="font-medium">Linha {l.numero}:</strong> {l.erros.join("; ")}
                      </li>
                    ))}
                  </Amostra>
                )}
                {previa.duplicadas.length > 0 && (
                  <Amostra titulo={`Duplicidades (${t.atualizacoes + t.duplicadas}, mostrando ${previa.duplicadas.length})`}>
                    {previa.duplicadas.map((l) => (
                      <li key={l.numero}>
                        <strong className="font-medium">Linha {l.numero}</strong> ({l.nome}): {ROTULO_CRITERIO_DE_DUPLICIDADE[l.por] ?? l.por}
                        {l.noArquivo ? ", repetida no arquivo" : ", já na base"}
                        {l.mudancas ? `; preencheria ${l.mudancas} campo(s) vazio(s)` : ""}
                        {l.conflitos ? `; ${l.conflitos} divergência(s) não aplicada(s)` : ""}
                      </li>
                    ))}
                  </Amostra>
                )}

                <label>
                  <span className={rotulo}>Qualificar pela campanha (opcional)</span>
                  <select id="importar-campanha" value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} className={campo}>
                    <option value="">Só importar, sem campanha</option>
                    {campanhas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-neutral-500">
                    Com campanha, cada empresa é pontuada pelos critérios do perfil dela. Empresa bloqueada não entra na campanha.
                  </span>
                </label>
              </>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={!podeConfirmar} className={botaoPrimario}>
            {t ? `Importar ${aProcessar} linha(s)` : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Cartao({ titulo, valor, destaque, perigo, dica }: { titulo: string; valor: number; destaque?: boolean; perigo?: boolean; dica?: string }) {
  return (
    <div title={dica} className={`rounded-lg border px-3 py-2 ${destaque ? "border-accent/40 bg-accent/5" : perigo ? "border-red-200 bg-red-50" : "border-neutral-200 bg-surface"}`}>
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function Amostra({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-neutral-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">{titulo}</summary>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-700 max-h-48 overflow-y-auto">{children}</ul>
    </details>
  );
}
