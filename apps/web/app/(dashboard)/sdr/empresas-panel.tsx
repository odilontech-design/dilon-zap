"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import {
  botaoPrimario,
  botaoSecundario,
  campoPequeno,
  COR_SITUACAO_CRITERIO,
  COR_STATUS_PROSPECTO,
  dataHora,
  formatarCnpj,
  formatarTelefone,
  nomeDaEmpresa,
  ROTULO_MOTIVO_SUPRESSAO,
  ROTULO_PORTE,
  ROTULO_SITUACAO_CRITERIO,
  ROTULO_STATUS_PROSPECTO,
  ROTULO_TIPO_SUPRESSAO,
  type StatusProspecto,
} from "./formatos-sdr";

type Bloqueio = { tipo: string; valor: string; motivo: string };
type ProspectoLinha = { id: string; campanhaId: string; campanhaNome: string; icpId: string; status: StatusProspecto; pontuacao: number | null; cobertura: number | null; motivo?: string | null };
type EmpresaLinha = {
  id: string;
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  uf: string | null;
  cidade: string | null;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
  porte: string | null;
  verificada: boolean;
  bloqueios: Bloqueio[];
  prospectos: ProspectoLinha[];
};
type Lista = { itens: EmpresaLinha[]; total: number; pagina: number; tamanho: number; resumo: Record<string, number>; podeEscrever: boolean };
type Opcao = { valor: string; empresas: number };
type Opcoes = { ufs: Opcao[]; cidades: Opcao[]; segmentos: Opcao[] };

/** O que o painel de indicadores pode pedir ao abrir a lista já filtrada. */
export type FiltroInicial = {
  campanhaId?: string;
  icpId?: string;
  status?: StatusProspecto;
  suprimida?: "sim" | "nao";
  telefone?: "sim" | "nao";
  email?: "sim" | "nao";
  uf?: string;
  cidade?: string;
  segmento?: string;
  ordem?: "pontuacao" | "data" | "prontas";
};

const SITUACOES: StatusProspecto[] = ["QUALIFICADO", "VERIFICAR", "NAO_QUALIFICADO", "PENDENTE"];

export function EmpresasPanel({
  podeEscrever,
  campanhas,
  perfis,
  filtroInicial,
}: {
  podeEscrever: boolean;
  campanhas: { id: string; nome: string }[];
  perfis: { id: string; nome: string }[];
  filtroInicial?: FiltroInicial;
}) {
  const [campanhaId, setCampanhaId] = useState(filtroInicial?.campanhaId ?? "");
  const [icpId, setIcpId] = useState(filtroInicial?.icpId ?? "");
  const [status, setStatus] = useState<string>(filtroInicial?.status ?? "");
  const [suprimida, setSuprimida] = useState<string>(filtroInicial?.suprimida ?? "");
  const [telefone, setTelefone] = useState<string>(filtroInicial?.telefone ?? "");
  const [email, setEmail] = useState<string>(filtroInicial?.email ?? "");
  const [uf, setUf] = useState(filtroInicial?.uf ?? "");
  const [cidade, setCidade] = useState(filtroInicial?.cidade ?? "");
  const [segmento, setSegmento] = useState(filtroInicial?.segmento ?? "");
  const [ordem, setOrdem] = useState<string>(filtroInicial?.ordem ?? "pontuacao");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  // A busca só dispara depois de parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const q = new URLSearchParams();
  if (campanhaId) q.set("campanhaId", campanhaId);
  if (icpId) q.set("icpId", icpId);
  if (status) q.set("status", status);
  if (suprimida) q.set("suprimida", suprimida);
  if (telefone) q.set("telefone", telefone);
  if (email) q.set("email", email);
  if (uf) q.set("uf", uf);
  if (cidade) q.set("cidade", cidade);
  if (segmento) q.set("segmento", segmento);
  if (ordem !== "pontuacao") q.set("ordem", ordem);
  if (buscaAplicada) q.set("busca", buscaAplicada);
  if (pagina > 1) q.set("pagina", String(pagina));
  const { data, error, mutate } = useSWR<Lista>(`/api/sdr/empresas?${q}`, fetcher, { keepPreviousData: true, refreshInterval: 8_000 });
  const { data: opcoes } = useSWR<Opcoes>("/api/sdr/empresas/opcoes", fetcher);

  const totalDePaginas = data ? Math.max(1, Math.ceil(data.total / data.tamanho)) : 1;
  const mudarFiltro = (fn: () => void) => {
    fn();
    setPagina(1);
    setMarcadas(new Set());
  };
  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function associar() {
    setMsg(null);
    const r = await chamar(`/api/sdr/campanhas/${destino}/prospectos`, "POST", { empresaIds: [...marcadas] });
    if (!r.ok) return setMsg(r.erro ?? "não deu para associar");
    const d = r.dados as { jaProcessadoOuNaFila: boolean; empresas: number };
    setMsg(d.jaProcessadoOuNaFila ? "Esta seleção já foi enviada para essa campanha. Use “Qualificar de novo” se o perfil mudou." : `${d.empresas} empresa(s) enviadas para qualificação. O resultado aparece aqui em instantes.`);
    setMarcadas(new Set());
    mutate();
  }

  async function requalificar() {
    setMsg(null);
    const r = await chamar(`/api/sdr/campanhas/${campanhaId}/requalificar`, "POST");
    if (!r.ok) return setMsg(r.erro ?? "não deu para qualificar de novo");
    setMsg((r.dados as { jaNaFila: boolean }).jaNaFila ? "Já está na fila." : "Qualificação enviada para a fila.");
    mutate();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-neutral-500">
          Campanha
          <select id="filtro-campanha" value={campanhaId} onChange={(e) => mudarFiltro(() => setCampanhaId(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Todas</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Perfil (ICP)
          <select id="filtro-icp" value={icpId} onChange={(e) => mudarFiltro(() => setIcpId(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Todos</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Situação
          <select id="filtro-status" value={status} onChange={(e) => mudarFiltro(() => setStatus(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PROSPECTO[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Bloqueio
          <select id="filtro-bloqueio" value={suprimida} onChange={(e) => mudarFiltro(() => setSuprimida(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Todas</option>
            <option value="sim">Só bloqueadas</option>
            <option value="nao">Sem bloqueio</option>
          </select>
        </label>
        <label className="text-[11px] text-neutral-500 flex-1 min-w-[160px]">
          Buscar
          <input id="filtro-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CNPJ, cidade, site ou e-mail" className={`${campoPequeno} block mt-0.5 w-full`} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-neutral-500">
          UF
          <select id="filtro-uf" value={uf} onChange={(e) => mudarFiltro(() => setUf(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Todas</option>
            {(opcoes?.ufs ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor} ({o.empresas})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Cidade
          <select id="filtro-cidade" value={cidade} onChange={(e) => mudarFiltro(() => setCidade(e.target.value))} className={`${campoPequeno} block mt-0.5 max-w-[180px]`}>
            <option value="">Todas</option>
            {(opcoes?.cidades ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor} ({o.empresas})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Segmento
          <select id="filtro-segmento" value={segmento} onChange={(e) => mudarFiltro(() => setSegmento(e.target.value))} className={`${campoPequeno} block mt-0.5 max-w-[180px]`}>
            <option value="">Todos</option>
            {(opcoes?.segmentos ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor} ({o.empresas})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          Telefone
          <select id="filtro-telefone" value={telefone} onChange={(e) => mudarFiltro(() => setTelefone(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Tanto faz</option>
            <option value="sim">Com telefone</option>
            <option value="nao">Sem telefone</option>
          </select>
        </label>
        <label className="text-[11px] text-neutral-500">
          E-mail
          <select id="filtro-email" value={email} onChange={(e) => mudarFiltro(() => setEmail(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="">Tanto faz</option>
            <option value="sim">Com e-mail</option>
            <option value="nao">Sem e-mail</option>
          </select>
        </label>
        <label className="text-[11px] text-neutral-500 sm:ml-auto">
          Ordenar por
          <select id="filtro-ordem" value={ordem} onChange={(e) => mudarFiltro(() => setOrdem(e.target.value))} className={`${campoPequeno} block mt-0.5`}>
            <option value="pontuacao">Maior pontuação</option>
            <option value="prontas">Qualificadas primeiro</option>
            <option value="data">Mais recentes</option>
          </select>
        </label>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500">{data.total} empresa(s) neste filtro</span>
          {podeEscrever && campanhaId && (
            <button onClick={requalificar} className={`${botaoSecundario} ml-auto py-1 text-xs`}>
              Qualificar de novo
            </button>
          )}
        </div>
      )}

      {podeEscrever && marcadas.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm">
          <span>{marcadas.size} selecionada(s)</span>
          <select id="associar-campanha" value={destino} onChange={(e) => setDestino(e.target.value)} className={campoPequeno}>
            <option value="">Escolha a campanha…</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button onClick={associar} disabled={!destino} className={botaoPrimario}>
            Associar e qualificar
          </button>
        </div>
      )}
      {msg && <p className="rounded-md bg-accent/5 px-3 py-2 text-sm text-accent">{msg}</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Carregando...</p>}
      {data?.itens.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-500">Nenhuma empresa neste filtro. Importe um CSV na aba Importações.</p>}

      {!!data?.itens.length && (
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                {podeEscrever && <th className="w-8 px-3 py-2" />}
                <th className="text-left font-medium px-3 py-2">Empresa</th>
                <th className="text-left font-medium px-3 py-2">Local</th>
                <th className="text-left font-medium px-3 py-2">Contato</th>
                <th className="text-left font-medium px-3 py-2">Campanhas</th>
                <th className="text-left font-medium px-3 py-2">Bloqueio</th>
              </tr>
            </thead>
            <tbody>
              {data.itens.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100 align-top hover:bg-neutral-50">
                  {podeEscrever && (
                    <td className="px-3 py-2.5">
                      <input id={`empresa-${e.id}`} type="checkbox" checked={marcadas.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Selecionar ${nomeDaEmpresa(e)}`} />
                    </td>
                  )}
                  <td className="px-3 py-2.5 cursor-pointer" onClick={() => setAberta(e.id)}>
                    <p className="font-medium">{nomeDaEmpresa(e)}</p>
                    <p className="text-[11px] text-neutral-500">{e.cnpj ? formatarCnpj(e.cnpj) : "sem CNPJ"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    <p>{[e.cidade, e.uf].filter(Boolean).join(" / ") || "—"}</p>
                    <p className="text-[11px] text-neutral-400">{e.segmento ?? ""}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-600">
                    <p className={e.telefone ? "" : "text-neutral-400"}>{e.telefone ? formatarTelefone(e.telefone) : "sem telefone"}</p>
                    <p className={e.email ? "break-all" : "text-neutral-400"}>{e.email ?? "sem e-mail"}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    {e.prospectos.length === 0 && <span className="text-xs text-neutral-400">fora de campanha</span>}
                    <div className="flex flex-col gap-1">
                      {e.prospectos.map((p) => (
                        <span key={p.id} className="flex flex-col gap-0.5 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 ${COR_STATUS_PROSPECTO[p.status]}`}>{ROTULO_STATUS_PROSPECTO[p.status]}</span>
                            <span className="text-neutral-600">{p.campanhaNome}</span>
                            {p.pontuacao !== null && <span className="tabular-nums text-neutral-500">{p.pontuacao} pts</span>}
                          </span>
                          {p.motivo && <span className="text-[11px] text-amber-700">{p.motivo}</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {e.bloqueios.length > 0 ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700" title={e.bloqueios.map((b) => `${ROTULO_TIPO_SUPRESSAO[b.tipo]}: ${ROTULO_MOTIVO_SUPRESSAO[b.motivo]}`).join("; ")}>
                        Bloqueada
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      {aberta && <FichaDaEmpresa id={aberta} onFechar={() => setAberta(null)} />}
    </div>
  );
}

type Ficha = Omit<EmpresaLinha, "prospectos"> & {
  telefone: string | null;
  email: string | null;
  site: string | null;
  cnae: string | null;
  origem: string;
  informadoNoCsv: { arquivo: string; linha: number; importadaEm: string } | null;
  prospectos: (ProspectoLinha & { icpNome: string; qualificadoEm: string | null; criterios: { chave: string; nome: string; tipo: string; peso: number; obrigatorio: boolean; situacao: string; justificativa: string }[] | null })[];
};

function FichaDaEmpresa({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data, error } = useSWR<Ficha>(`/api/sdr/empresas/${id}`, fetcher);
  const linha = (nome: string, valor: string | null | undefined) => (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-xs text-neutral-500">{nome}</span>
      <span className="min-w-0 break-words">{valor || "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{data ? nomeDaEmpresa(data) : "Empresa"}</h2>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {data && (
          <>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Dados informados no CSV{data.informadoNoCsv ? ` (${data.informadoNoCsv.arquivo}, linha ${data.informadoNoCsv.linha}, ${dataHora(data.informadoNoCsv.importadaEm)})` : ""}.{" "}
              {data.verificada ? "Já conferidos." : "Ainda não foram conferidos por ninguém."}
            </p>
            {data.bloqueios.length > 0 && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <p className="font-medium">Bloqueada pela lista de supressão. Não deve ser prospectada.</p>
                <ul className="mt-1 text-xs">
                  {data.bloqueios.map((b) => (
                    <li key={`${b.tipo}${b.valor}`}>
                      {ROTULO_TIPO_SUPRESSAO[b.tipo]}: {ROTULO_MOTIVO_SUPRESSAO[b.motivo]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {linha("Razão social", data.razaoSocial)}
              {linha("Nome fantasia", data.nomeFantasia)}
              {linha("CNPJ", data.cnpj ? formatarCnpj(data.cnpj) : null)}
              {linha("Telefone", formatarTelefone(data.telefone))}
              {linha("E-mail", data.email)}
              {linha("Site", data.site)}
              {linha("Local", [data.cidade, data.uf].filter(Boolean).join(" / "))}
              {linha("Segmento", data.segmento)}
              {linha("Porte", data.porte ? (ROTULO_PORTE[data.porte] ?? data.porte) : null)}
              {linha("CNAE", data.cnae)}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Qualificação por campanha</h3>
              {data.prospectos.length === 0 && <p className="text-sm text-neutral-500">Esta empresa não está em nenhuma campanha.</p>}
              {data.prospectos.map((p) => (
                <div key={p.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{p.campanhaNome}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS_PROSPECTO[p.status]}`}>{ROTULO_STATUS_PROSPECTO[p.status]}</span>
                    {p.pontuacao !== null && <span className="text-xs tabular-nums text-neutral-600">{p.pontuacao} pontos</span>}
                    {p.cobertura !== null && <span className="text-xs text-neutral-500">{p.cobertura}% do perfil avaliado</span>}
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Perfil {p.icpNome}
                    {p.qualificadoEm ? ` · ${dataHora(p.qualificadoEm)}` : ""}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {(p.criterios ?? []).map((c) => (
                      <li key={c.chave} className="flex flex-wrap items-start gap-2 text-xs">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 ${COR_SITUACAO_CRITERIO[c.situacao] ?? ""}`}>{ROTULO_SITUACAO_CRITERIO[c.situacao] ?? c.situacao}</span>
                        <span className="min-w-0 flex-1">
                          <strong className="font-medium">{c.nome}</strong> (peso {c.peso}
                          {c.obrigatorio ? ", obrigatório" : ""}): {c.justificativa}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
