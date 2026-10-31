"use client";

import { useState } from "react";
import useSWR from "swr";
import { PORTES, ROTULO_PORTE, ROTULO_STATUS_CAMPANHA, STATUS_CAMPANHA, UFS } from "@/lib/sdr/esquemas";
import { chamar, fetcher } from "../receber/formatos";
import { BloqueiosPanel } from "./bloqueios-panel";
import { EmpresasPanel, type FiltroInicial } from "./empresas-panel";
import { ImportacoesPanel } from "./importacoes-panel";
import { PainelIndicadores } from "./painel-indicadores";

type Criterio = { nome: string; descricao?: string; peso: number; obrigatorio: boolean };
type Perfil = {
  id: string;
  nome: string;
  descricao: string | null;
  segmentos: string[];
  cnaes: string[];
  ufs: string[];
  cidades: string[];
  portes: string[];
  caracteristicas: string[];
  criterios: Criterio[];
  _count?: { campanhas: number };
};
type Status = (typeof STATUS_CAMPANHA)[number];
type Campanha = { id: string; nome: string; descricao: string | null; status: Status; icp: { id: string; nome: string } };

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm";
const rotulo = "block text-xs font-medium text-neutral-700 mb-1";
const CORES_STATUS: Record<Status, string> = {
  RASCUNHO: "bg-neutral-100 text-neutral-600",
  ATIVA: "bg-accent/10 text-accent",
  PAUSADA: "bg-amber-100 text-amber-800",
  ENCERRADA: "bg-neutral-200 text-neutral-500",
};

const paraLista = (texto: string) => [...new Set(texto.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))];

type Aba = "campanhas" | "perfis" | "empresas" | "importacoes" | "bloqueios";

export function SdrPanel({ podeEscrever }: { podeEscrever: boolean }) {
  const [aba, setAba] = useState<Aba>("campanhas");
  // Ao vir de "Ver empresas bloqueadas", a aba de empresas já abre filtrada.
  const [filtroEmpresas, setFiltroEmpresas] = useState<FiltroInicial | undefined>(undefined);
  const perfis = useSWR<{ perfis: Perfil[] }>("/api/sdr/icps", fetcher);
  const campanhas = useSWR<{ campanhas: Campanha[] }>("/api/sdr/campanhas", fetcher);

  const abaClasse = (ativa: boolean) =>
    `px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${ativa ? "border-accent text-accent font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"}`;
  const aba_ = (id: Aba, nome: string) => (
    <button role="tab" aria-selected={aba === id} onClick={() => { setFiltroEmpresas(undefined); setAba(id); }} className={abaClasse(aba === id)}>
      {nome}
    </button>
  );
  const listaDeCampanhas = campanhas.data?.campanhas ?? [];
  const listaDePerfis = perfis.data?.perfis ?? [];

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">SDR</h1>
        <p className="text-sm text-neutral-500">Campanhas, perfis de cliente ideal e as empresas importadas para prospecção.</p>
      </div>
      <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        Nada é pesquisado, enviado ou criado no CRM. As empresas vêm só do CSV que você importa, e os dados delas não foram verificados por ninguém.
      </p>

      <PainelIndicadores
        campanhas={listaDeCampanhas}
        perfis={listaDePerfis}
        abrir={(filtro) => {
          setFiltroEmpresas(filtro);
          setAba("empresas");
        }}
      />

      <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto" role="tablist">
        {aba_("campanhas", `Campanhas ${campanhas.data ? `(${listaDeCampanhas.length})` : ""}`)}
        {aba_("perfis", `Perfis de cliente ${perfis.data ? `(${listaDePerfis.length})` : ""}`)}
        {aba_("empresas", "Empresas")}
        {aba_("importacoes", "Importações")}
        {aba_("bloqueios", "Bloqueios")}
      </div>

      {aba === "campanhas" && (
        <Campanhas
          lista={campanhas.data?.campanhas}
          erro={campanhas.error}
          perfis={listaDePerfis}
          podeEscrever={podeEscrever}
          onMudou={() => campanhas.mutate()}
          irParaPerfis={() => setAba("perfis")}
        />
      )}
      {aba === "perfis" && (
        <Perfis
          lista={perfis.data?.perfis}
          erro={perfis.error}
          podeEscrever={podeEscrever}
          onMudou={() => {
            perfis.mutate();
            campanhas.mutate();
          }}
        />
      )}
      {aba === "empresas" && <EmpresasPanel key={JSON.stringify(filtroEmpresas ?? {})} podeEscrever={podeEscrever} campanhas={listaDeCampanhas} perfis={listaDePerfis} filtroInicial={filtroEmpresas} />}
      {aba === "importacoes" && <ImportacoesPanel podeEscrever={podeEscrever} campanhas={listaDeCampanhas} />}
      {aba === "bloqueios" && (
        <BloqueiosPanel
          podeEscrever={podeEscrever}
          verEmpresasBloqueadas={() => {
            setFiltroEmpresas({ suprimida: "sim" });
            setAba("empresas");
          }}
        />
      )}
    </div>
  );
}

function Campanhas({
  lista,
  erro,
  perfis,
  podeEscrever,
  onMudou,
  irParaPerfis,
}: {
  lista?: Campanha[];
  erro?: Error;
  perfis: Perfil[];
  podeEscrever: boolean;
  onMudou: () => void;
  irParaPerfis: () => void;
}) {
  const [editando, setEditando] = useState<Campanha | "nova" | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function excluir(c: Campanha) {
    setFalha(null);
    const r = await chamar(`/api/sdr/campanhas/${c.id}`, "DELETE");
    if (!r.ok) return setFalha(r.erro ?? "não deu pra excluir");
    onMudou();
  }

  return (
    <div className="flex flex-col gap-3">
      {podeEscrever && (
        <div className="flex items-center justify-end gap-3">
          {perfis.length === 0 && (
            <button onClick={irParaPerfis} className="text-xs text-accent hover:underline">
              Crie um perfil de cliente primeiro
            </button>
          )}
          <button
            onClick={() => setEditando("nova")}
            disabled={perfis.length === 0}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Nova campanha
          </button>
        </div>
      )}
      {erro && <p className="text-sm text-red-600">{erro.message}</p>}
      {falha && <p className="text-sm text-red-600">{falha}</p>}
      {!lista && !erro && <p className="text-sm text-neutral-400">Carregando...</p>}
      {lista?.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-500">Nenhuma campanha cadastrada.</p>}
      {!!lista?.length && (
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Campanha</th>
                <th className="text-left font-medium px-4 py-2">Perfil de cliente</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                {podeEscrever && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{c.nome}</p>
                    {c.descricao && <p className="text-xs text-neutral-500">{c.descricao}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.icp.nome}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${CORES_STATUS[c.status]}`}>{ROTULO_STATUS_CAMPANHA[c.status]}</span>
                  </td>
                  {podeEscrever && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setEditando(c)} className="text-xs text-accent hover:underline">
                        Editar
                      </button>
                      <button onClick={() => excluir(c)} className="ml-3 text-xs text-neutral-500 hover:text-red-600">
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <FormCampanha
          campanha={editando === "nova" ? null : editando}
          perfis={perfis}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            onMudou();
          }}
        />
      )}
    </div>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Rodape({ salvando, onFechar }: { salvando: boolean; onFechar: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
        Cancelar
      </button>
      <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        Salvar
      </button>
    </div>
  );
}

function FormCampanha({ campanha, perfis, onFechar, onSalvo }: { campanha: Campanha | null; perfis: Perfil[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(campanha?.nome ?? "");
  const [descricao, setDescricao] = useState(campanha?.descricao ?? "");
  const [icpId, setIcpId] = useState(campanha?.icp.id ?? perfis[0]?.id ?? "");
  const [status, setStatus] = useState<Status>(campanha?.status ?? "RASCUNHO");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const corpo = { nome, descricao: descricao.trim() || null, icpId, status };
    const r = await chamar(campanha ? `/api/sdr/campanhas/${campanha.id}` : "/api/sdr/campanhas", campanha ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra salvar");
    onSalvo();
  }

  return (
    <Modal titulo={campanha ? "Editar campanha" : "Nova campanha"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label>
          <span className={rotulo}>Nome</span>
          <input id="campanha-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={80} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Descrição</span>
          <textarea id="campanha-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Perfil de cliente</span>
          <select id="campanha-perfil" value={icpId} onChange={(e) => setIcpId(e.target.value)} required className={campo}>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={rotulo}>Status</span>
          <select id="campanha-status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className={campo}>
            {STATUS_CAMPANHA.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_CAMPANHA[s]}
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <Rodape salvando={salvando} onFechar={onFechar} />
      </form>
    </Modal>
  );
}

function Perfis({ lista, erro, podeEscrever, onMudou }: { lista?: Perfil[]; erro?: Error; podeEscrever: boolean; onMudou: () => void }) {
  const [editando, setEditando] = useState<Perfil | "novo" | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function excluir(p: Perfil) {
    setFalha(null);
    const r = await chamar(`/api/sdr/icps/${p.id}`, "DELETE");
    if (!r.ok) return setFalha(r.erro ?? "não deu pra excluir");
    onMudou();
  }

  return (
    <div className="flex flex-col gap-3">
      {podeEscrever && (
        <div className="flex justify-end">
          <button onClick={() => setEditando("novo")} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            Novo perfil
          </button>
        </div>
      )}
      {erro && <p className="text-sm text-red-600">{erro.message}</p>}
      {falha && <p className="text-sm text-red-600">{falha}</p>}
      {!lista && !erro && <p className="text-sm text-neutral-400">Carregando...</p>}
      {lista?.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-500">Nenhum perfil de cliente cadastrado.</p>}
      {lista?.map((p) => (
        <div key={p.id} className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 flex flex-col gap-1.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{p.nome}</p>
              {p.descricao && <p className="text-xs text-neutral-500">{p.descricao}</p>}
            </div>
            {podeEscrever && (
              <div className="shrink-0 whitespace-nowrap">
                <button onClick={() => setEditando(p)} className="text-xs text-accent hover:underline">
                  Editar
                </button>
                <button onClick={() => excluir(p)} className="ml-3 text-xs text-neutral-500 hover:text-red-600">
                  Excluir
                </button>
              </div>
            )}
          </div>
          <Resumo titulo="Segmento" itens={p.segmentos} />
          <Resumo titulo="CNAE" itens={p.cnaes} />
          <Resumo titulo="Região" itens={[...p.ufs, ...p.cidades]} />
          <Resumo titulo="Porte" itens={p.portes.map((x) => ROTULO_PORTE[x as keyof typeof ROTULO_PORTE] ?? x)} />
          <Resumo titulo="Características" itens={p.caracteristicas} />
          <Resumo titulo="Critérios" itens={p.criterios.map((c) => `${c.nome} (peso ${c.peso}${c.obrigatorio ? ", obrigatório" : ""})`)} />
        </div>
      ))}
      {editando && (
        <FormPerfil
          perfil={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            onMudou();
          }}
        />
      )}
    </div>
  );
}

function Resumo({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <p className="text-xs text-neutral-600">
      <span className="font-medium text-neutral-700">{titulo}:</span> {itens.join(", ")}
    </p>
  );
}

function FormPerfil({ perfil, onFechar, onSalvo }: { perfil: Perfil | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [descricao, setDescricao] = useState(perfil?.descricao ?? "");
  const [segmentos, setSegmentos] = useState((perfil?.segmentos ?? []).join(", "));
  const [cnaes, setCnaes] = useState((perfil?.cnaes ?? []).join(", "));
  const [ufs, setUfs] = useState<string[]>(perfil?.ufs ?? []);
  const [cidades, setCidades] = useState((perfil?.cidades ?? []).join(", "));
  const [portes, setPortes] = useState<string[]>(perfil?.portes ?? []);
  const [caracteristicas, setCaracteristicas] = useState((perfil?.caracteristicas ?? []).join("\n"));
  const [criterios, setCriterios] = useState<Criterio[]>(perfil?.criterios ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const alternar = (lista: string[], valor: string) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  const trocarCriterio = (i: number, mudanca: Partial<Criterio>) => setCriterios(criterios.map((c, j) => (j === i ? { ...c, ...mudanca } : c)));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const listaCnaes = paraLista(cnaes).map((c) => c.replace(/\D/g, ""));
    if (listaCnaes.some((c) => c.length !== 7)) return setErro("cada CNAE precisa ter 7 dígitos");
    if (criterios.some((c) => !c.nome.trim())) return setErro("todo critério precisa de nome");
    setSalvando(true);
    const corpo = {
      nome,
      descricao: descricao.trim() || null,
      segmentos: paraLista(segmentos),
      cnaes: listaCnaes,
      ufs,
      cidades: paraLista(cidades),
      portes,
      caracteristicas: paraLista(caracteristicas),
      criterios: criterios.map((c) => ({ nome: c.nome, ...(c.descricao ? { descricao: c.descricao } : {}), peso: c.peso, obrigatorio: c.obrigatorio })),
    };
    const r = await chamar(perfil ? `/api/sdr/icps/${perfil.id}` : "/api/sdr/icps", perfil ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra salvar");
    onSalvo();
  }

  return (
    <Modal titulo={perfil ? "Editar perfil de cliente" : "Novo perfil de cliente"} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label>
          <span className={rotulo}>Nome</span>
          <input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={80} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Descrição</span>
          <textarea id="perfil-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Segmentos (separados por vírgula)</span>
          <input id="perfil-segmentos" value={segmentos} onChange={(e) => setSegmentos(e.target.value)} placeholder="Clínicas, contabilidade" className={campo} />
        </label>
        <label>
          <span className={rotulo}>CNAEs, com 7 dígitos (opcional)</span>
          <input id="perfil-cnaes" value={cnaes} onChange={(e) => setCnaes(e.target.value)} inputMode="numeric" className={campo} />
        </label>
        <fieldset>
          <legend className={rotulo}>Estados</legend>
          <div className="flex flex-wrap gap-1">
            {UFS.map((uf) => (
              <button
                key={uf}
                type="button"
                aria-pressed={ufs.includes(uf)}
                onClick={() => setUfs(alternar(ufs, uf))}
                className={`w-10 rounded border py-1 text-xs ${ufs.includes(uf) ? "border-accent bg-accent/10 text-accent" : "border-neutral-300 text-neutral-600"}`}
              >
                {uf}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span className={rotulo}>Cidades (separadas por vírgula)</span>
          <input id="perfil-cidades" value={cidades} onChange={(e) => setCidades(e.target.value)} className={campo} />
        </label>
        <fieldset>
          <legend className={rotulo}>Porte</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {PORTES.map((p) => (
              <label key={p} className="flex items-center gap-1.5">
                <input id={`perfil-porte-${p}`} type="checkbox" checked={portes.includes(p)} onChange={() => setPortes(alternar(portes, p))} />
                {ROTULO_PORTE[p]}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span className={rotulo}>Características (uma por linha)</span>
          <textarea id="perfil-caracteristicas" value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} rows={3} className={campo} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className={rotulo}>Critérios de qualificação</legend>
          {criterios.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                id={`criterio-nome-${i}`}
                value={c.nome}
                onChange={(e) => trocarCriterio(i, { nome: e.target.value })}
                placeholder="Critério"
                aria-label={`Nome do critério ${i + 1}`}
                maxLength={80}
                className={`${campo} flex-1 min-w-[160px]`}
              />
              <label className="flex items-center gap-1 text-xs text-neutral-600">
                Peso
                <input
                  id={`criterio-peso-${i}`}
                  type="number"
                  min={1}
                  max={10}
                  value={c.peso}
                  onChange={(e) => trocarCriterio(i, { peso: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-14 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm tabular-nums"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-neutral-600">
                <input id={`criterio-obrigatorio-${i}`} type="checkbox" checked={c.obrigatorio} onChange={(e) => trocarCriterio(i, { obrigatorio: e.target.checked })} />
                Obrigatório
              </label>
              <button type="button" onClick={() => setCriterios(criterios.filter((_, j) => j !== i))} aria-label={`Remover critério ${i + 1}`} className="text-neutral-400 hover:text-red-600">
                ×
              </button>
            </div>
          ))}
          {criterios.length < 20 && (
            <button type="button" onClick={() => setCriterios([...criterios, { nome: "", peso: 5, obrigatorio: false }])} className="self-start text-xs text-accent hover:underline">
              + Critério
            </button>
          )}
        </fieldset>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <Rodape salvando={salvando} onFechar={onFechar} />
      </form>
    </Modal>
  );
}
