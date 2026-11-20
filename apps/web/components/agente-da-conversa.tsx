"use client";

import { useState } from "react";
import useSWR from "swr";

/**
 * A faixa do vendedor de IA no cabeçalho da conversa. Mostra quem está falando (a IA ou a equipe) e deixa ligar o vendedor
 * para este contato, parar a IA na hora ou voltar às regras automáticas do SDR. Só aparece onde o SDR está ligado.
 */

type Controle = {
  vendedorPronto: boolean;
  modo: "SUGERIR" | "AUTOMATICO";
  controle: "LIGADO" | "DESLIGADO" | null;
  campanhaId: string | null;
  alteradoPor: string | null;
  doSdr: boolean;
  estado: { status: "ATIVA" | "TRANSFERIDA" | "ENCERRADA"; motivo: string | null; resumo: string | null; turnos: number; sugestao: string | null; sugestaoAcao: string | null } | null;
  campanhas: { id: string; nome: string }[];
  canceladas?: number;
};

const ROTULO_ACAO: Record<string, string> = {
  continuar: "continua a conversa",
  interesse: "demonstrou interesse",
  demonstracao: "quer a demonstração",
  transferir: "passa para a equipe",
  sem_interesse: "sem interesse",
  nao_contatar: "pediu para não ser contatada",
};

const buscar = async (url: string): Promise<Controle | null> => {
  const r = await fetch(url);
  return r.ok ? ((await r.json()) as Controle) : null;
};

const botao = "rounded-md border border-neutral-300 bg-surface px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-accent disabled:opacity-50";
const botaoForte = "rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";

export function AgenteDaConversa({ conversationId }: { conversationId: string }) {
  const url = `/api/vendedor-saas/conversas/${conversationId}/controle`;
  const { data, mutate } = useSWR(url, buscar, { refreshInterval: 10_000, shouldRetryOnError: false });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campanhaId, setCampanhaId] = useState("");
  const [texto, setTexto] = useState<string | null>(null);

  if (!data) return null;

  async function enviar(caminho: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    const r = await fetch(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return setErro(typeof j.error === "string" ? j.error : "não deu pra concluir");
    setTexto(null);
    await mutate();
    return j as Controle;
  }
  const mudar = (acao: "ligar" | "desligar" | "automatico") => enviar(url, { acao, ...(acao === "ligar" && campanhaId ? { campanhaId } : {}) });

  const saiu = data.estado && data.estado.status !== "ATIVA";
  const falando = data.controle === "LIGADO" && !saiu;
  const modo = data.modo === "SUGERIR" ? "sugerindo" : "automático";
  const sugestao = data.estado?.status === "ATIVA" ? data.estado.sugestao : null;

  let rotulo: React.ReactNode;
  let cor = "border-neutral-200 bg-neutral-50 text-neutral-600";
  if (data.controle === "DESLIGADO") {
    rotulo = <span>IA parada nesta conversa{data.alteradoPor ? ` por ${data.alteradoPor}` : ""}.</span>;
  } else if (falando) {
    cor = "border-accent/30 bg-accent/10 text-accent";
    rotulo = <span><strong>IA atendendo</strong> (Vendedor, {modo}).</span>;
  } else if (saiu) {
    cor = "border-amber-200 bg-amber-50 text-amber-800";
    rotulo = <span>{data.estado!.status === "ENCERRADA" ? "Conversa encerrada pela IA" : "A IA saiu"}{data.estado!.motivo ? `: ${data.estado!.motivo}` : ""}.</span>;
  } else if (data.doSdr && data.vendedorPronto) {
    cor = "border-accent/20 bg-accent/5 text-neutral-700";
    rotulo = <span>Vendedor IA em <strong>automático</strong> (empresa do SDR): responde quando ela escreve.</span>;
  } else {
    rotulo = <span>Vendedor IA desligado nesta conversa.</span>;
  }

  return (
    <div className={`flex flex-col gap-2 border-b px-3 md:px-6 py-2 text-xs ${cor}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {rotulo}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {!falando && !data.doSdr && data.campanhas.length > 0 && (
            <select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} aria-label="Roteiro do vendedor" className="rounded-md border border-neutral-300 bg-surface px-1.5 py-1 text-xs text-neutral-700">
              <option value="">Roteiro: campanha ativa mais recente</option>
              {data.campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          {!falando && (
            <button type="button" disabled={ocupado} onClick={() => mudar("ligar")} className={botaoForte}>
              {saiu ? "Ligar de novo" : "Ligar o vendedor"}
            </button>
          )}
          {data.controle !== "DESLIGADO" && (
            <button type="button" disabled={ocupado} onClick={() => mudar("desligar")} className={botao} title="Para a IA agora e cancela o que ela deixou na fila">
              Parar a IA
            </button>
          )}
          {data.controle && (
            <button type="button" disabled={ocupado} onClick={() => mudar("automatico")} className={botao} title="Volta às regras automáticas do SDR">
              Voltar ao automático
            </button>
          )}
        </div>
      </div>

      {erro && <p className="rounded bg-red-50 px-2 py-1 text-red-700">{erro}</p>}
      {data.estado?.resumo && (falando || saiu) && <p className="text-[11px] text-neutral-500">Resumo da IA: {data.estado.resumo}</p>}

      {sugestao && (
        <div className="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-surface p-2.5 text-neutral-800">
          <p className="text-[11px] font-medium text-neutral-600">Resposta sugerida{data.estado?.sugestaoAcao ? ` (${ROTULO_ACAO[data.estado.sugestaoAcao] ?? data.estado.sugestaoAcao})` : ""}</p>
          <textarea value={texto ?? sugestao} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={900} aria-label="Resposta sugerida" className="w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={ocupado || !(texto ?? sugestao).trim()}
              onClick={() => {
                if (!window.confirm("Enviar esta mensagem para o contato pelo WhatsApp?")) return;
                const editado = texto !== null && texto.trim() !== sugestao.trim();
                void enviar(`/api/vendedor-saas/conversas/${conversationId}/enviar`, editado ? { texto } : {});
              }}
              className={botaoForte}
            >
              Enviar pelo WhatsApp
            </button>
            <button type="button" disabled={ocupado} onClick={() => void enviar(`/api/vendedor-saas/conversas/${conversationId}/descartar`)} className={botao}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
