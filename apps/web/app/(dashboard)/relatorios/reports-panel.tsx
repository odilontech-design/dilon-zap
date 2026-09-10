"use client";

import useSWR from "swr";
import { LISTING_INTERVAL } from "@/lib/polling";

/**
 * Painel de relatórios.
 *
 * A API já devolvia situação das conversas, carga por atendente e estado da
 * conexão — e a tela mostrava só três números, ignorando o resto. Não houve
 * consulta nova aqui: é o mesmo payload, inteiro.
 *
 * Sem gráfico de propósito. São contagens pequenas que se leem melhor como
 * número e tabela; uma barra por atendente entra só como pista de proporção
 * ao lado do valor, nunca no lugar dele.
 */

type Agente = { id: string; name: string; active: number; resolved: number };

type Summary = {
  messages24h: number;
  messages7d: number;
  avgFirstResponseMinutes: number | null;
  firstResponseSampleSize: number;
  statusCounts: { OPEN: number; PENDING: number; RESOLVED: number };
  agentWorkload: Agente[];
  session: { status: string; phoneNumber: string | null } | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatMinutes(minutes: number) {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

// Rótulo e tom da conexão. O texto vem SEMPRE junto da cor: quem não
// distingue verde de vermelho precisa conseguir ler o estado do mesmo jeito.
const CONEXAO: Record<string, { rotulo: string; classe: string }> = {
  CONNECTED: { rotulo: "Conectado", classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PENDING_QR: { rotulo: "Aguardando leitura do QR", classe: "bg-amber-50 text-amber-800 border-amber-200" },
  DISCONNECTED: { rotulo: "Reconectando", classe: "bg-amber-50 text-amber-800 border-amber-200" },
  LOGGED_OUT: { rotulo: "Desconectado", classe: "bg-red-50 text-red-700 border-red-200" },
};

function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <p className="text-xs text-neutral-500 mb-1">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-400">{nota}</p>}
    </div>
  );
}

export function ReportsPanel() {
  const { data } = useSWR<Summary>("/api/reports/summary", fetcher, { refreshInterval: LISTING_INTERVAL });

  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const conexao = data.session ? (CONEXAO[data.session.status] ?? null) : null;

  // Só quem tem conversa atribuída aparece. Uma lista com metade da equipe
  // zerada faz o zero de quem realmente não atendeu se perder no meio.
  const comCarga = data.agentWorkload
    .filter((a) => a.active > 0 || a.resolved > 0)
    .sort((a, b) => b.active - a.active || b.resolved - a.resolved);

  const maiorCarga = Math.max(1, ...comCarga.map((a) => a.active));
  const emAndamento = data.statusCounts.OPEN + data.statusCounts.PENDING;

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {conexao && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${conexao.classe}`}>
          <span className="font-medium">WhatsApp: {conexao.rotulo}</span>
          {data.session?.phoneNumber && (
            <span className="ml-2 opacity-80">{data.session.phoneNumber}</span>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Movimento</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Cartao rotulo="Mensagens (24h)" valor={String(data.messages24h)} />
          <Cartao rotulo="Mensagens (7 dias)" valor={String(data.messages7d)} />
          <Cartao
            rotulo="Tempo médio até 1ª resposta"
            valor={
              data.avgFirstResponseMinutes !== null
                ? formatMinutes(data.avgFirstResponseMinutes)
                : "—"
            }
            nota={
              data.firstResponseSampleSize > 0
                ? `últimas ${data.firstResponseSampleSize} conversas`
                : "sem conversa respondida ainda"
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Situação das conversas</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Cartao rotulo="Em atendimento" valor={String(data.statusCounts.OPEN)} />
          <Cartao rotulo="Pendentes" valor={String(data.statusCounts.PENDING)} />
          <Cartao rotulo="Resolvidas" valor={String(data.statusCounts.RESOLVED)} />
        </div>
        {emAndamento > 0 && (
          <p className="mt-2 text-xs text-neutral-400">
            {emAndamento} conversa(s) ainda esperando desfecho.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Carga por atendente</h2>

        {comCarga.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma conversa atribuída ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Atendente</th>
                  <th className="px-4 py-2 text-right font-medium">Em aberto</th>
                  <th className="px-4 py-2 text-right font-medium">Resolvidas</th>
                </tr>
              </thead>
              <tbody>
                {comCarga.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2.5">{a.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Pista de proporção, não a informação. O número
                            continua sendo o que se lê; a barra só deixa a
                            diferença entre 2 e 14 visível de relance. */}
                        <span
                          aria-hidden
                          className="h-1.5 rounded-full bg-accent/30"
                          style={{ width: `${Math.round((a.active / maiorCarga) * 64)}px` }}
                        />
                        <span className="tabular-nums font-medium">{a.active}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                      {a.resolved}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-neutral-400">
          Conta conversas atribuídas. Conversa sem responsável, inclusive as que estão na fila de
          um setor, não entra na carga de ninguém.
        </p>
      </section>
    </div>
  );
}
