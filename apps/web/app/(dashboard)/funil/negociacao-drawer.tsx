"use client";

import { useEffect, useState } from "react";
import { ItensNegociacao } from "./itens-negociacao";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { TarefasNegociacao } from "./tarefas-negociacao";
import { diasParada, fetcher, reaisParaCentavos, type Etapa, type Motivo, type Negociacao, type Usuario } from "./tipos";

type Evento = {
  id: string;
  tipo: "CRIADA" | "ETAPA" | "GANHA" | "PERDIDA" | "REABERTA";
  deEtapaNome: string | null;
  paraEtapaNome: string | null;
  porNome: string | null;
  em: string;
};

type Detalhe = {
  eventos: Evento[];
  detalhePerda: string | null;
  pedidos: { id: string; numero: number; status: string; totalCents: number; pago: boolean }[];
  _count: { itens: number };
};

function descreverEvento(e: Evento): string {
  switch (e.tipo) {
    case "CRIADA":
      return `Criada em ${e.paraEtapaNome ?? "—"}`;
    case "ETAPA":
      return `${e.deEtapaNome ?? "—"} → ${e.paraEtapaNome ?? "—"}`;
    case "GANHA":
      return "Marcada como ganha";
    case "PERDIDA":
      return "Marcada como perdida";
    case "REABERTA":
      return `Reaberta em ${e.paraEtapaNome ?? "—"}`;
  }
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Gaveta da negociação: edita os campos, muda o estado (ganhar, perder,
 * reabrir) e mostra a linha do tempo. Mudança de etapa e de estado vão pelo
 * PATCH com `acao`, que é o que grava o histórico — nunca por campo solto.
 */
export function NegociacaoDrawer({
  negociacao,
  etapas,
  usuarios,
  motivos,
  origens,
  onFechar,
  onMudou,
}: {
  negociacao: Negociacao;
  etapas: Etapa[];
  usuarios: Usuario[];
  motivos: Motivo[];
  origens: string[];
  onFechar: () => void;
  onMudou: () => void;
}) {
  const router = useRouter();
  const { data: detalhe, mutate: recarregar } = useSWR<Detalhe>(`/api/negociacoes/${negociacao.id}`, fetcher);

  const [titulo, setTitulo] = useState(negociacao.titulo);
  const [valor, setValor] = useState((negociacao.valorCents / 100).toFixed(2).replace(".", ","));
  const [recorrencia, setRecorrencia] = useState(negociacao.recorrencia);
  const [responsavelId, setResponsavelId] = useState(negociacao.responsavel?.id ?? "");
  const [origem, setOrigem] = useState(negociacao.origem ?? "");
  const [previsao, setPrevisao] = useState(negociacao.previsaoFechamento ? negociacao.previsaoFechamento.slice(0, 10) : "");
  const [stageId, setStageId] = useState(negociacao.stageId);

  const [perdendo, setPerdendo] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [detalhePerda, setDetalhePerda] = useState("");

  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aberta = negociacao.status === "ABERTA";
  const motivosAtivos = motivos.filter((m) => m.ativo);
  const comItens = (detalhe?._count.itens ?? 0) > 0;

  // Com itens, valor e cobrança vêm deles: quando o quadro recarrega com o
  // total novo, os campos acompanham, em vez de mostrar o valor antigo.
  useEffect(() => {
    if (comItens) {
      setValor((negociacao.valorCents / 100).toFixed(2).replace(".", ","));
      setRecorrencia(negociacao.recorrencia);
    }
  }, [comItens, negociacao.valorCents, negociacao.recorrencia]);

  async function enviar(corpo: Record<string, unknown>, fecharDepois = false): Promise<boolean> {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/negociacoes/${negociacao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(typeof body.error === "string" ? body.error : "não deu pra salvar");
        return false;
      }
      onMudou();
      recarregar();
      if (fecharDepois) onFechar();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  /** Só o que o usuário digitou nos campos — a etapa e o estado têm botões próprios. */
  function camposEditados() {
    const valorCents = reaisParaCentavos(valor);
    if (valorCents === null) {
      setErro("valor inválido");
      return null;
    }
    return {
      titulo: titulo.trim(),
      valorCents,
      recorrencia,
      responsavelId: responsavelId || null,
      origem: origem.trim() || null,
      previsaoFechamento: previsao ? new Date(previsao).toISOString() : null,
    };
  }

  async function salvar() {
    const campos = camposEditados();
    if (!campos) return;
    await enviar(campos);
  }

  async function mudarEtapa(novaId: string) {
    setStageId(novaId);
    await enviar({ acao: "mover", stageId: novaId });
  }

  async function ganhar() {
    const campos = camposEditados();
    if (!campos) return;
    // O valor digitado entra junto: ganhar com o valor corrigido é um gesto só.
    await enviar({ ...campos, acao: "ganhar" }, true);
  }

  async function perder() {
    if (!motivoId) return setErro("escolha o motivo da perda");
    await enviar({ acao: "perder", motivoPerdaId: motivoId, detalhe: detalhePerda.trim() || null }, true);
  }

  async function abrirConversa() {
    const res = await fetch(`/api/contacts/${negociacao.contato.id}/start-conversation`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra abrir a conversa");
    }
    router.push(`/inbox?open=${(await res.json()).id}`);
  }

  async function apagar() {
    if (!confirm("Apagar esta negociação e o histórico dela? Isso não pode ser desfeito.")) return;
    const res = await fetch(`/api/negociacoes/${negociacao.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra apagar");
    }
    onMudou();
    onFechar();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-50";
  const parada = aberta ? diasParada(negociacao) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <aside
        className="bg-surface w-full max-w-md h-full overflow-y-auto shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-neutral-500 truncate">
              {negociacao.contato.nome || negociacao.contato.telefone || "Sem nome"}
            </p>
            <h2 className="text-base font-semibold break-words">{negociacao.titulo}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span
                className={`text-[10px] rounded-full px-2 py-0.5 ${
                  negociacao.status === "GANHA"
                    ? "bg-green-100 text-green-700"
                    : negociacao.status === "PERDIDA"
                      ? "bg-red-100 text-red-700"
                      : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {negociacao.status === "GANHA" ? "Ganha" : negociacao.status === "PERDIDA" ? "Perdida" : "Em andamento"}
              </span>
              {parada > 14 && (
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                  parada há {parada} dias
                </span>
              )}
            </div>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>

        {aberta && (
          <div className="flex flex-wrap gap-2">
            <button onClick={ganhar} disabled={ocupado} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              Ganhou
            </button>
            <button
              onClick={() => setPerdendo((v) => !v)}
              disabled={ocupado}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Perdeu
            </button>
            <button onClick={abrirConversa} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Abrir conversa
            </button>
          </div>
        )}

        {!aberta && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => enviar({ acao: "reabrir" })}
              disabled={ocupado}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Reabrir
            </button>
            <button onClick={abrirConversa} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Abrir conversa
            </button>
          </div>
        )}

        {perdendo && aberta && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex flex-col gap-2">
            <label className="text-xs font-medium text-neutral-700">Por que perdeu?</label>
            <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} className={campo}>
              <option value="">Escolha o motivo</option>
              {motivosAtivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            <textarea
              value={detalhePerda}
              onChange={(e) => setDetalhePerda(e.target.value)}
              placeholder="Detalhe (opcional)"
              rows={2}
              className={campo}
            />
            <button onClick={perder} disabled={ocupado} className="self-end rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              Confirmar perda
            </button>
          </div>
        )}

        {negociacao.status === "PERDIDA" && (
          <p className="text-xs text-neutral-600">
            Motivo: <span className="font-medium">{motivos.find((m) => m.id === negociacao.motivoPerdaId)?.nome ?? "—"}</span>
            {detalhe?.detalhePerda && <> — {detalhe.detalhePerda}</>}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {aberta && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Etapa</label>
              <select value={stageId} onChange={(e) => mudarEtapa(e.target.value)} disabled={ocupado} className={campo}>
                {etapas.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Valor (R$)</label>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={comItens}
                title={comItens ? "O valor vem dos itens abaixo" : undefined}
                inputMode="decimal"
                className={campo}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Cobrança</label>
              <select
                value={recorrencia}
                onChange={(e) => setRecorrencia(e.target.value as "UNICA" | "MENSAL")}
                disabled={comItens}
                className={campo}
              >
                <option value="UNICA">Única</option>
                <option value="MENSAL">Mensal (recorrente)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Responsável</label>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={campo}>
                <option value="">Ninguém</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Previsão</label>
              <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={campo} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Origem</label>
            <input value={origem} onChange={(e) => setOrigem(e.target.value)} list="origens-gaveta" className={campo} />
            <datalist id="origens-gaveta">
              {origens.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <p className="text-[11px] text-neutral-400">
            {negociacao.recorrencia === "MENSAL" ? `${centsToBRL(negociacao.valorCents)} por mês` : centsToBRL(negociacao.valorCents)}
          </p>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex items-center justify-between">
          <button onClick={apagar} className="text-xs text-red-600 hover:underline">
            Apagar
          </button>
          <button onClick={salvar} disabled={ocupado} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Salvar
          </button>
        </div>

        <ItensNegociacao
          negociacaoId={negociacao.id}
          editavel={aberta}
          pedidos={detalhe?.pedidos ?? []}
          onMudou={() => {
            onMudou();
            recarregar();
          }}
        />

        <TarefasNegociacao
          negociacaoId={negociacao.id}
          usuarios={usuarios}
          somenteLeitura={!aberta}
          onMudou={onMudou}
        />

        <div>
          <h3 className="text-sm font-semibold mb-2">Histórico</h3>
          {!detalhe ? (
            <p className="text-xs text-neutral-400">Carregando...</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detalhe.eventos.map((e) => (
                <li key={e.id} className="text-xs">
                  <p className="text-neutral-800">{descreverEvento(e)}</p>
                  <p className="text-neutral-400">
                    {quando(e.em)}
                    {e.porNome && ` · ${e.porNome}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
