"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import { botaoPrimario, botaoSecundario, campo, dataHora, rotulo } from "./formatos-sdr";

type Config = { ativo: boolean; modo: "SUGERIR" | "AUTOMATICO"; nomeAssistente: string; instrucoes: string | null; limiteTurnos: number; horaInicio: number; horaFim: number; ativadoEm: string | null };
type Item = {
  conversationId: string;
  empresaId: string;
  empresa: string;
  local: string | null;
  status: "ATIVA" | "TRANSFERIDA" | "ENCERRADA";
  motivo: string | null;
  resumo: string | null;
  turnos: number;
  sugestao: string | null;
  sugestaoAcao: string | null;
  sugestaoEm: string | null;
  ultimaDaEmpresa: string | null;
  atualizadaEm: string;
};
type Dados = { configuracao: Config; resumoDoMes: { atendidas: number; ativas: number; transferidas: number; encerradas: number }; itens: Item[]; podeEscrever: boolean };

const ROTULO_STATUS = { ATIVA: "Com a IA", TRANSFERIDA: "Com a equipe", ENCERRADA: "Encerrada" } as const;
const COR_STATUS = { ATIVA: "bg-accent/10 text-accent", TRANSFERIDA: "bg-amber-100 text-amber-800", ENCERRADA: "bg-neutral-100 text-neutral-600" } as const;
const ROTULO_ACAO: Record<string, string> = {
  continuar: "continua a conversa",
  interesse: "demonstrou interesse",
  demonstracao: "quer a demonstração",
  transferir: "passa para a equipe",
  sem_interesse: "sem interesse",
  nao_contatar: "pediu para não ser contatada",
};

/**
 * O vendedor de SaaS: responde as empresas que responderam a uma abordagem do SDR, no WhatsApp. Nunca puxa assunto.
 * Começa no modo "sugerir": a IA escreve, uma pessoa lê e envia. Só depois de ler algumas conversas vale ligar o automático.
 */
export function VendedorPanel({ podeEscrever }: { podeEscrever: boolean }) {
  const { data, error, mutate } = useSWR<Dados>("/api/vendedor-saas", fetcher, { refreshInterval: 15_000, keepPreviousData: true });
  const [f, setF] = useState<Config | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  // O formulário só é preenchido da primeira vez, para a atualização automática não apagar o que a pessoa está digitando.
  useEffect(() => {
    if (data && !f) setF(data.configuracao);
  }, [data, f]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    setSalvando(true);
    setAviso(null);
    const r = await chamar("/api/vendedor-saas", "PUT", {
      ativo: f.ativo,
      modo: f.modo,
      nomeAssistente: f.nomeAssistente,
      instrucoes: f.instrucoes ?? "",
      limiteTurnos: f.limiteTurnos,
      horaInicio: f.horaInicio,
      horaFim: f.horaFim,
    });
    setSalvando(false);
    if (!r.ok) return setAviso({ tipo: "erro", texto: r.erro ?? "não deu pra salvar" });
    setAviso({ tipo: "ok", texto: f.ativo ? "Vendedor ligado." : "Configuração salva (vendedor desligado)." });
    mutate();
  }

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data || !f) return <p className="text-sm text-neutral-400">Carregando...</p>;
  const escreve = podeEscrever && data.podeEscrever;
  const r = data.resumoDoMes;
  const mudar = <K extends keyof Config>(k: K, v: Config[K]) => setF({ ...f, [k]: v });

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-neutral-200 bg-surface p-4 text-sm text-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-900">Vendedor IA do SDR</h2>
        <p className="mt-1">
          Responde, no WhatsApp, as empresas que <strong>responderam</strong> a uma abordagem sua. Ele nunca puxa assunto: a primeira mensagem continua sendo sua, por clique. Usa o roteiro da campanha (argumento, ofertas, objeções, link da agenda), propõe a demonstração e
          passa para você quando o assunto é outro. Sai da conversa assim que alguém da equipe escreve, respeita o horário e o limite de respostas, e quem pede para não ser contatado entra na lista de bloqueio.
        </p>
        <p className="mt-2 text-xs text-neutral-500">Precisa da IA do SDR ligada, com o modelo da tarefa “vendedor_saas” (aba IA). O modelo e o gasto são os de lá.</p>
      </section>

      <form onSubmit={salvar} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.ativo} disabled={!escreve} onChange={(e) => mudar("ativo", e.target.checked)} />
          Vendedor ligado
          {data.configuracao.ativo && data.configuracao.ativadoEm && <span className="text-xs font-normal text-neutral-500">desde {dataHora(data.configuracao.ativadoEm)}: só atende respostas que chegaram depois disso</span>}
        </label>

        <fieldset className="flex flex-col gap-2" disabled={!escreve}>
          <legend className={rotulo}>Como responde</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="modo" checked={f.modo === "SUGERIR"} onChange={() => mudar("modo", "SUGERIR")} className="mt-1" />
            <span>
              <strong>Sugerir</strong> (recomendado no começo): a IA escreve a resposta e você lê, edita e envia ou descarta. Nada sai sem você.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="modo" checked={f.modo === "AUTOMATICO"} onChange={() => mudar("modo", "AUTOMATICO")} className="mt-1" />
            <span>
              <strong>Automático</strong>: a IA envia sozinha, dentro das regras abaixo. Ligue depois de ler algumas conversas e gostar do que ela escreve.
            </span>
          </label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="sm:col-span-2">
            <span className={rotulo}>Nome do assistente</span>
            <input value={f.nomeAssistente} disabled={!escreve} onChange={(e) => mudar("nomeAssistente", e.target.value)} maxLength={60} className={campo} />
          </label>
          <label>
            <span className={rotulo}>Respostas por conversa</span>
            <input type="number" min={1} max={30} value={f.limiteTurnos} disabled={!escreve} onChange={(e) => mudar("limiteTurnos", Number(e.target.value))} className={campo} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={rotulo}>Das (h)</span>
              <input type="number" min={0} max={23} value={f.horaInicio} disabled={!escreve} onChange={(e) => mudar("horaInicio", Number(e.target.value))} className={campo} />
            </label>
            <label>
              <span className={rotulo}>Até (h)</span>
              <input type="number" min={1} max={24} value={f.horaFim} disabled={!escreve} onChange={(e) => mudar("horaFim", Number(e.target.value))} className={campo} />
            </label>
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-neutral-500">Horário de Brasília, de segunda a sábado. Fora dele a IA espera e responde na próxima janela. Depois de {f.limiteTurnos} respostas na mesma conversa, ela passa para uma pessoa.</p>

        <label>
          <span className={rotulo}>Instruções extras (o que não prometer, assuntos para passar a uma pessoa)</span>
          <textarea value={f.instrucoes ?? ""} disabled={!escreve} onChange={(e) => mudar("instrucoes", e.target.value)} maxLength={3000} rows={4} className={campo} placeholder="Ex.: não falar de preço de implantação; contrato e desconto são com o Felipe." />
        </label>

        {aviso && <p className={`rounded-md px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-accent/10 text-accent" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
        {escreve && (
          <div>
            <button type="submit" disabled={salvando} className={botaoPrimario}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        )}
      </form>

      <section className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ["Atendidas no mês", r.atendidas],
          ["Com a IA agora", r.ativas],
          ["Passadas para a equipe", r.transferidas],
          ["Encerradas", r.encerradas],
        ].map(([nome, valor]) => (
          <div key={String(nome)} className="rounded-md bg-neutral-50 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">{valor}</p>
            <p className="text-[11px] text-neutral-500">{nome}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-surface">
        <header className="border-b border-neutral-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold">Conversas</h2>
          <p className="text-[11px] text-neutral-500">As 50 mais recentes. A que tem resposta sugerida aparece com o texto para você enviar ou descartar.</p>
        </header>
        {data.itens.length === 0 ? (
          <p className="px-4 py-4 text-xs text-neutral-500">Nenhuma conversa ainda. Elas aparecem quando uma empresa responde a uma abordagem sua e o vendedor está ligado.</p>
        ) : (
          <ul>
            {data.itens.map((i) => (
              <Conversa key={i.conversationId} item={i} podeEscrever={escreve} aoMudar={() => mutate()} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Conversa({ item: i, podeEscrever, aoMudar }: { item: Item; podeEscrever: boolean; aoMudar: () => void }) {
  const [texto, setTexto] = useState(i.sugestao ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Uma sugestão nova (a empresa escreveu de novo) substitui o texto que estava na caixa.
  useEffect(() => setTexto(i.sugestao ?? ""), [i.sugestao, i.sugestaoEm]);

  async function enviar() {
    if (!window.confirm("Enviar esta mensagem para a empresa pelo WhatsApp?")) return;
    setOcupado(true);
    setErro(null);
    const editado = texto.trim() !== (i.sugestao ?? "").trim();
    const r = await chamar(`/api/vendedor-saas/conversas/${i.conversationId}/enviar`, "POST", editado ? { texto } : {});
    setOcupado(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra enviar");
    aoMudar();
  }
  async function descartar() {
    setOcupado(true);
    setErro(null);
    const r = await chamar(`/api/vendedor-saas/conversas/${i.conversationId}/descartar`, "POST");
    setOcupado(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra descartar");
    aoMudar();
  }

  return (
    <li className="border-t border-neutral-100 px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{i.empresa}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_STATUS[i.status]}`}>{ROTULO_STATUS[i.status]}</span>
        {i.local && <span className="text-[11px] text-neutral-500">{i.local}</span>}
        <span className="text-[11px] text-neutral-500">
          {i.turnos} resposta(s) · {dataHora(i.atualizadaEm)}
        </span>
        <a href={`/inbox?open=${i.conversationId}`} className="ml-auto text-xs text-accent hover:underline">
          Abrir no Inbox
        </a>
      </div>
      {i.ultimaDaEmpresa && <p className="mt-1 text-xs text-neutral-600">A empresa escreveu: “{i.ultimaDaEmpresa}”</p>}
      {i.motivo && <p className="mt-1 text-[11px] text-neutral-500">Motivo: {i.motivo}</p>}
      {i.resumo && <p className="mt-1 text-[11px] text-neutral-500">Resumo da IA: {i.resumo}</p>}

      {i.sugestao && i.status === "ATIVA" && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[11px] font-medium text-neutral-600">Resposta sugerida{i.sugestaoAcao ? ` (${ROTULO_ACAO[i.sugestaoAcao] ?? i.sugestaoAcao})` : ""}</p>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={900} disabled={!podeEscrever} aria-label="Resposta sugerida" className={campo} />
          {erro && <p className="text-xs text-red-700">{erro}</p>}
          {podeEscrever && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={enviar} disabled={ocupado || !texto.trim()} className={botaoPrimario}>
                Enviar pelo WhatsApp
              </button>
              <button onClick={descartar} disabled={ocupado} className={botaoSecundario}>
                Descartar
              </button>
              <span className="text-[11px] text-neutral-500">Enviar registra a etapa no SDR e conta como uma resposta da IA.</span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
