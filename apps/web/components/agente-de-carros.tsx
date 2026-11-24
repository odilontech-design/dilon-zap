"use client";

import { useState } from "react";
import useSWR from "swr";

/**
 * A faixa do Vendedor IA de carros no cabeçalho da conversa: mostra quem está atendendo (a IA ou a equipe) e deixa o vendedor
 * assumir (parar a IA na hora), devolver a conversa à IA ou voltar às regras automáticas. Some onde a IA não está ligada.
 */

type Controle = {
  ligadoNaLoja: boolean;
  controle: "LIGADO" | "DESLIGADO" | null;
  alteradoPor: string | null;
  estado: { status: "ATIVA" | "TRANSFERIDA" | "ENCERRADA"; motivo: string | null; resumo: string | null; turnos: number } | null;
  canceladas?: number;
};

const buscar = async (url: string): Promise<Controle | null> => {
  const r = await fetch(url);
  return r.ok ? ((await r.json()) as Controle) : null;
};

const botao = "rounded-md border border-neutral-300 bg-surface px-2.5 py-1.5 text-xs md:py-1 font-medium text-neutral-700 hover:border-accent disabled:opacity-50";
const botaoForte = "rounded-md bg-accent px-2.5 py-1.5 text-xs md:py-1 font-medium text-white hover:opacity-90 disabled:opacity-50";

export function AgenteDeCarros({ conversationId }: { conversationId: string }) {
  const url = `/api/vendedor-ia/conversas/${conversationId}/controle`;
  const { data, mutate } = useSWR(url, buscar, { refreshInterval: 10_000, shouldRetryOnError: false });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!data) return null;
  // IA desligada na loja e sem nenhum controle gravado: nada a mostrar.
  if (!data.ligadoNaLoja && !data.controle && !data.estado) return null;

  async function agir(acao: "ligar" | "desligar" | "automatico") {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return setErro(typeof j.error === "string" ? j.error : "não deu para concluir");
    if (acao === "desligar") setAviso(j.canceladas ? `A IA parou. ${j.canceladas} resposta(s) que ainda não tinham saído foram canceladas.` : "A IA parou nesta conversa.");
    await mutate();
  }

  const parada = data.controle === "DESLIGADO";
  const transferida = data.estado?.status === "TRANSFERIDA";
  const atendendo = !parada && !transferida && data.ligadoNaLoja && (data.controle === "LIGADO" || data.estado?.status === "ATIVA");

  let titulo: string;
  let detalhe: string | null = null;
  let cor = "border-neutral-200 bg-surface text-neutral-700";
  if (parada) {
    titulo = "IA parada nesta conversa";
    detalhe = data.alteradoPor ? `${data.alteradoPor} assumiu o atendimento.` : "A equipe assumiu o atendimento.";
  } else if (transferida) {
    titulo = "Com a equipe";
    detalhe = [data.estado?.motivo ? `A IA passou: ${data.estado.motivo}.` : null, data.estado?.resumo ? `Resumo da IA: ${data.estado.resumo}` : null].filter(Boolean).join(" ") || null;
  } else if (atendendo) {
    titulo = `IA atendendo${data.estado ? ` · ${data.estado.turnos} resposta(s)` : ""}`;
    cor = "border-accent/40 bg-accent/5 text-neutral-800";
  } else if (data.ligadoNaLoja) {
    titulo = "IA ligada na loja";
    detalhe = "Ainda não atendeu esta conversa: ela só entra em conversa nova, sem atendente e dentro das regras.";
  } else {
    titulo = "IA desligada na loja";
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 text-xs md:px-6 ${cor}`} data-testid="agente-de-carros">
      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
        <span className={`inline-block h-2 w-2 rounded-full ${atendendo ? "bg-emerald-500" : parada || transferida ? "bg-amber-500" : "bg-neutral-400"}`} aria-hidden />
        {titulo}
      </span>
      {/* No celular o texto desce para a linha de baixo, em largura total; ao lado do título ele ficava numa coluna estreita. */}
      {detalhe && <span className="order-2 line-clamp-4 basis-full text-neutral-600 md:order-none md:line-clamp-none md:min-w-0 md:flex-1 md:basis-0">{detalhe}</span>}
      {aviso && <span className="order-2 basis-full text-emerald-700 md:order-none md:basis-auto">{aviso}</span>}
      {erro && <span className="order-2 basis-full text-red-600 md:order-none md:basis-auto">{erro}</span>}
      <span className="order-1 ml-auto flex flex-wrap justify-end gap-1.5 md:order-last">
        {(atendendo || (!parada && !transferida && data.ligadoNaLoja)) && (
          <button type="button" disabled={ocupado} onClick={() => agir("desligar")} className={atendendo ? botaoForte : botao}>
            Assumir (parar a IA)
          </button>
        )}
        {(parada || transferida) && data.ligadoNaLoja && (
          <button type="button" disabled={ocupado} onClick={() => agir("ligar")} className={botaoForte}>
            Devolver à IA
          </button>
        )}
        {parada && (
          <button type="button" disabled={ocupado} onClick={() => agir("automatico")} className={botao} title="Volta a valer a regra automática: a IA só entra em conversa nova e sem atendente.">
            Voltar ao automático
          </button>
        )}
      </span>
    </div>
  );
}
