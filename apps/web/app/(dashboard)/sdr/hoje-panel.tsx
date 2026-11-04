"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "../receber/formatos";
import { FichaDaEmpresa, type FiltroInicial } from "./empresas-panel";
import { COR_ETAPA, dataCurta, hojeEmBrasilia, isoParaData, nomeDaEmpresa, ROTULO_ETAPA, ROTULO_PRODUTO, type EtapaComercial } from "./formatos-sdr";

type Item = {
  id: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cidade: string | null;
  uf: string | null;
  bloqueios: unknown[];
  comercial: { etapa: EtapaComercial; produto: string | null; prioridade: string; proximaAcao: string | null; proximaAcaoEm: string | null; decisorNome: string | null; decisorCargo: string | null; abordagem: string | null };
};
type Bloco = { total: number; itens: Item[] };
type Resumo = { prontas: number; aRevisar: number; aPreparar: number; contatosRegistradosHoje: number; whatsapp: { limiteDiario: number; restantesHoje: number } };
type Hoje = Record<"prioritarias" | "decisoresAIdentificar" | "abordagensPendentes" | "contatosARealizar" | "followUpsDeHoje" | "reunioes" | "oportunidades", Bloco>;

const BLOCOS: { id: keyof Hoje; titulo: string; vazio: string; filtro: FiltroInicial }[] = [
  { id: "followUpsDeHoje", titulo: "Follow-ups de hoje", vazio: "Nenhum follow-up vence hoje.", filtro: { visao: "followup", ordem: "acao" } },
  { id: "contatosARealizar", titulo: "Contatos que preciso realizar", vazio: "Nenhuma abordagem aprovada esperando contato.", filtro: { visao: "aprovadas", ordem: "prioridade" } },
  { id: "abordagensPendentes", titulo: "Abordagens aguardando aprovação", vazio: "Nenhuma abordagem para revisar.", filtro: { visao: "preparadas", ordem: "prioridade" } },
  { id: "decisoresAIdentificar", titulo: "Decisores a identificar", vazio: "Todas as empresas disponíveis já têm decisor.", filtro: { visao: "disponiveis", ordem: "prioridade" } },
  { id: "prioritarias", titulo: "Empresas prioritárias", vazio: "Importe ou adicione empresas para começar.", filtro: { visao: "disponiveis", ordem: "prioridade" } },
  { id: "reunioes", titulo: "Reuniões agendadas", vazio: "Nenhuma reunião registrada.", filtro: { visao: "responderam", ordem: "acao" } },
  { id: "oportunidades", titulo: "Oportunidades em andamento", vazio: "Nenhuma empresa respondeu ainda.", filtro: { visao: "responderam", ordem: "acao" } },
];

/** A tela para começar o dia: o que fazer agora, sem navegar por várias áreas. */
export function HojePanel({ podeEscrever, abrirCentral, abrirFila }: { podeEscrever: boolean; abrirCentral: (f: FiltroInicial) => void; abrirFila: () => void }) {
  const { data, error, mutate } = useSWR<Hoje>("/api/sdr/comercial/hoje", fetcher, { refreshInterval: 20_000, keepPreviousData: true });
  const resumo = useSWR<Resumo>("/api/sdr/fila/resumo", fetcher, { refreshInterval: 20_000, keepPreviousData: true });
  const [aberta, setAberta] = useState<string | null>(null);
  const hoje = hojeEmBrasilia();

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;
  const vazio = Object.values(data).every((b) => b.total === 0);

  return (
    <div className="flex flex-col gap-4">
      {resumo.data && resumo.data.prontas + resumo.data.aRevisar + resumo.data.aPreparar > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-surface px-4 py-3">
          <p className="text-sm text-neutral-700">
            <span className="font-medium">Fila do dia:</span> {resumo.data.prontas} pronta(s) para contatar, {resumo.data.aRevisar} para revisar e {resumo.data.aPreparar} para preparar. {resumo.data.contatosRegistradosHoje} contato(s) registrado(s) hoje · WhatsApp: restam {resumo.data.whatsapp.restantesHoje} de {resumo.data.whatsapp.limiteDiario}.
          </p>
          <button onClick={abrirFila} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Abrir a fila do dia
          </button>
        </div>
      )}
      {vazio && (
        <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-sm text-neutral-600">
          <p className="font-medium">Ainda não há empresas para prospectar.</p>
          <p className="mt-1">Importe um CSV na aba Importações ou use “+ Adicionar empresa” na aba Prospecção. Depois, volte aqui para ver o que fazer a cada dia.</p>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCOS.map((b) => {
          const bloco = data[b.id];
          return (
            <section key={b.id} id={`hoje-${b.id}`} className="rounded-lg border border-neutral-200 bg-surface">
              <header className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5">
                <h2 className="text-sm font-semibold">
                  {b.titulo} <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal tabular-nums text-neutral-600">{bloco.total}</span>
                </h2>
                {bloco.total > bloco.itens.length && (
                  <button onClick={() => abrirCentral(b.filtro)} className="text-xs text-accent hover:underline">
                    Ver todas
                  </button>
                )}
              </header>
              {bloco.itens.length === 0 ? (
                <p className="px-4 py-4 text-xs text-neutral-500">{b.vazio}</p>
              ) : (
                <ul>
                  {bloco.itens.map((e) => {
                    const atrasada = !!e.comercial.proximaAcaoEm && isoParaData(e.comercial.proximaAcaoEm) < hoje;
                    return (
                      <li key={e.id} className="border-t border-neutral-100 first:border-t-0">
                        <button onClick={() => setAberta(e.id)} className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-neutral-50">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{nomeDaEmpresa(e)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_ETAPA[e.comercial.etapa]}`}>{ROTULO_ETAPA[e.comercial.etapa]}</span>
                            {e.comercial.prioridade === "ALTA" && <span className="text-[11px] font-medium text-amber-700">prioridade alta</span>}
                            {e.comercial.produto && <span className="text-[11px] text-neutral-500">{ROTULO_PRODUTO[e.comercial.produto]}</span>}
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {[e.cidade, e.uf].filter(Boolean).join(" / ") || "sem local"}
                            {e.comercial.decisorNome ? ` · ${e.comercial.decisorNome}${e.comercial.decisorCargo ? `, ${e.comercial.decisorCargo}` : ""}` : " · sem decisor"}
                          </span>
                          {e.comercial.proximaAcaoEm && (
                            <span className={`text-[11px] ${atrasada ? "font-medium text-red-600" : "text-neutral-500"}`}>
                              {atrasada ? "atrasada · " : ""}
                              {dataCurta(e.comercial.proximaAcaoEm)} · {e.comercial.proximaAcao ?? "próxima ação"}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {aberta && <FichaDaEmpresa id={aberta} podeEscrever={podeEscrever} aoMudar={() => mutate()} onFechar={() => { setAberta(null); mutate(); }} />}
    </div>
  );
}
