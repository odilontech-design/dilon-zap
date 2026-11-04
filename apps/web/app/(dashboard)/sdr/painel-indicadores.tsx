"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "../receber/formatos";
import type { FiltroInicial } from "./empresas-panel";
import { campoPequeno } from "./formatos-sdr";

type Indicadores = {
  total: number;
  qualificadas: number;
  verificar: number;
  aguardando: number;
  naoQualificadas: number;
  foraDeCampanha: number;
  bloqueadas: number;
  semCnpj: number;
  semTelefone: number;
  semEmail: number;
  semSite: number;
  semContato: number;
  incompletas: number;
  telefoneDescartado: number;
};
type Destaque = { valor: string; qualificadas: number; total: number };
type Resposta = { indicadores: Indicadores; melhoresCidades: Destaque[]; melhoresSegmentos: Destaque[] };

const numero = (n: number) => n.toLocaleString("pt-BR");

/**
 * Os números do topo do SDR. Cada empresa conta uma vez, mesmo em várias campanhas ou importações.
 * Um cartão com seta abre a aba Empresas já filtrada.
 */
export function PainelIndicadores({
  campanhas,
  perfis,
  abrir,
}: {
  campanhas: { id: string; nome: string }[];
  perfis: { id: string; nome: string }[];
  abrir: (filtro: FiltroInicial) => void;
}) {
  const [campanhaId, setCampanhaId] = useState("");
  const [icpId, setIcpId] = useState("");

  const q = new URLSearchParams();
  if (campanhaId) q.set("campanhaId", campanhaId);
  if (icpId) q.set("icpId", icpId);
  const { data, error } = useSWR<Resposta>(`/api/sdr/painel?${q}`, fetcher, { keepPreviousData: true, refreshInterval: 15_000 });

  const base: FiltroInicial = { ...(campanhaId ? { campanhaId } : {}), ...(icpId ? { icpId } : {}) };
  const i = data?.indicadores;

  const Cartao = ({ titulo, valor, dica, filtro, destaque }: { titulo: string; valor: number; dica?: string; filtro?: FiltroInicial; destaque?: boolean }) => {
    const conteudo = (
      <>
        <span className="text-[11px] text-neutral-500">{titulo}</span>
        <span className={`text-lg font-semibold tabular-nums ${destaque ? "text-accent" : ""}`}>{numero(valor)}</span>
        {dica && <span className="text-[11px] text-neutral-400">{dica}</span>}
      </>
    );
    const classe = "flex flex-col items-start rounded-md border border-neutral-200 bg-surface px-3 py-2 text-left";
    return filtro ? (
      <button type="button" onClick={() => abrir({ ...base, ...filtro })} className={`${classe} hover:border-accent`} title="Ver estas empresas na lista">
        {conteudo}
      </button>
    ) : (
      <div className={classe}>{conteudo}</div>
    );
  };

  return (
    <details open className="rounded-lg border border-neutral-200 bg-neutral-50/60">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium">Indicadores {i ? `· ${numero(i.total)} empresa(s)` : ""}</summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-neutral-500">
            Campanha
            <select id="painel-campanha" value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} className={`${campoPequeno} block mt-0.5`}>
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
            <select id="painel-icp" value={icpId} onChange={(e) => setIcpId(e.target.value)} className={`${campoPequeno} block mt-0.5`}>
              <option value="">Todos</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {!i && !error && <p className="text-sm text-neutral-400">Carregando...</p>}
        {i && i.total === 0 && <p className="text-sm text-neutral-500">Nenhuma empresa neste filtro. Importe um CSV na aba Importações.</p>}

        {i && i.total > 0 && (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-700">Situação</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Cartao titulo="Qualificadas" valor={i.qualificadas} dica="prontas para prospectar" filtro={{ status: "QUALIFICADO" }} destaque />
                <Cartao titulo="Para verificar" valor={i.verificar} dica="falta conferir um dado" filtro={{ status: "VERIFICAR" }} />
                <Cartao titulo="Aguardando" valor={i.aguardando} dica="na fila de qualificação" filtro={{ status: "PENDENTE" }} />
                <Cartao titulo="Não qualificadas" valor={i.naoQualificadas} filtro={{ status: "NAO_QUALIFICADO" }} />
                <Cartao titulo="Fora de campanha" valor={i.foraDeCampanha} dica="ainda não avaliadas" />
                <Cartao titulo="Bloqueadas" valor={i.bloqueadas} dica="lista de bloqueio" filtro={{ suprimida: "sim" }} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-700">Dados que faltam</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Cartao titulo="Sem CNPJ" valor={i.semCnpj} />
                <Cartao titulo="Sem telefone" valor={i.semTelefone} filtro={{ telefone: "nao" }} />
                <Cartao titulo="Sem e-mail" valor={i.semEmail} filtro={{ email: "nao" }} />
                <Cartao titulo="Sem site" valor={i.semSite} />
                <Cartao titulo="Sem telefone nem e-mail" valor={i.semContato} dica="sem como contatar" />
                <Cartao titulo="Telefone descartado" valor={i.telefoneDescartado} dica="inválido no CSV" />
              </div>
            </div>

            {(data.melhoresCidades.length > 0 || data.melhoresSegmentos.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Destaques titulo="Cidades com mais qualificadas" itens={data.melhoresCidades} aoEscolher={(valor) => abrir({ ...base, status: "QUALIFICADO", cidade: valor })} />
                <Destaques titulo="Segmentos com mais qualificadas" itens={data.melhoresSegmentos} aoEscolher={(valor) => abrir({ ...base, status: "QUALIFICADO", segmento: valor })} />
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-neutral-500">
              Cada empresa conta uma vez, mesmo estando em mais de uma campanha ou importação; se estiver em várias campanhas, entra na melhor situação (qualificada, depois para verificar, aguardando, não qualificada). Bloqueadas também aparecem
              nas situações acima. “Telefone descartado” só conta empresas importadas cujo telefone foi recusado por ser inválido e que seguem sem telefone; linhas inteiras recusadas não viram empresa e não entram aqui.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

function Destaques({ titulo, itens, aoEscolher }: { titulo: string; itens: Destaque[]; aoEscolher: (valor: string) => void }) {
  if (itens.length === 0) return null;
  return (
    <div className="rounded-md border border-neutral-200 bg-surface px-3 py-2">
      <p className="mb-1 text-xs font-medium text-neutral-700">{titulo}</p>
      <ul className="flex flex-col">
        {itens.map((d) => (
          <li key={d.valor}>
            <button type="button" onClick={() => aoEscolher(d.valor)} className="flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 text-left text-xs hover:bg-neutral-50">
              <span className="min-w-0 truncate">{d.valor}</span>
              <span className="shrink-0 tabular-nums text-neutral-500">
                <strong className="font-semibold text-accent">{numero(d.qualificadas)}</strong> de {numero(d.total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
