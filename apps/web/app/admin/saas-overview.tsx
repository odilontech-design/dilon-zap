"use client";

import useSWR from "swr";
import Link from "next/link";
import { centsToBRL } from "@/lib/billing";

/**
 * O retrato da Dilon Tech como empresa SaaS, no topo do painel.
 *
 * Paleta escura do admin, nao a do app: o painel e escuro por desenho e prende
 * data-theme="light" pra escala neutra nao inverter. Usar bg-surface aqui
 * pintaria blocos claros no meio de uma tela preta.
 *
 * A ordem da tela é a ordem da urgência: primeiro o que pede ação hoje
 * (alertas), depois o dinheiro, depois a lista. Quem abre o painel de manhã
 * precisa saber o que fazer antes de saber quanto entra.
 */

type Situacao = "TRIAL" | "ACTIVE" | "PAUSED" | "CANCELED" | "SEM_ASSINATURA";
type Ativacao = "ativo" | "esfriando" | "parado" | "nunca_ativou";

type Cliente = {
  id: string;
  nome: string;
  situacao: Situacao;
  mensalCents: number | null;
  plano: string | null;
  plataformaCompleta: boolean;
  ativacao: Ativacao;
  diasDeTeste: number | null;
  usuariosAtivos: number;
  faturasVencidas: number;
  whatsappConectado: boolean;
  ultimaMensagemEm: string | null;
};

type Resposta = {
  resumo: {
    mrrCents: number;
    arrCents: number;
    porSituacao: Record<Situacao, number>;
    inadimplentes: number;
    semAtivacao: number;
  };
  alertas: { clienteId: string; nome: string; nivel: "urgente" | "atencao"; texto: string }[];
  clientes: Cliente[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SITUACAO: Record<Situacao, string> = {
  TRIAL: "Em teste",
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CANCELED: "Cancelado",
  SEM_ASSINATURA: "Sem assinatura",
};

// Rótulo escrito sempre junto da cor: o estado tem que ser legível por quem
// não distingue verde de vermelho.
const ATIVACAO: Record<Ativacao, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Usando", classe: "bg-emerald-950/60 text-emerald-300 border-emerald-900" },
  esfriando: { rotulo: "Esfriando", classe: "bg-amber-950/50 text-amber-300 border-amber-900" },
  parado: { rotulo: "Parado", classe: "bg-red-950/50 text-red-300 border-red-900" },
  nunca_ativou: { rotulo: "Nunca ativou", classe: "bg-red-950/50 text-red-300 border-red-900" },
};

const PLANO: Record<string, string> = { ESSENCIAL: "Essencial", PROFISSIONAL: "Profissional", ESCALA: "Escala" };

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="mb-1 text-xs text-neutral-400">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums text-neutral-100">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-500">{nota}</p>}
    </div>
  );
}

export function SaasOverview() {
  const { data } = useSWR<Resposta>("/api/admin/saas", fetcher);

  if (!data) return <p className="mb-8 text-sm text-neutral-500">Carregando panorama...</p>;
  if ("error" in data) return null;

  const { resumo, alertas, clientes } = data;
  const pagantes = resumo.porSituacao.ACTIVE;

  return (
    <div className="mb-10 flex flex-col gap-6">
      {alertas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-200">Pede ação hoje</h2>
          <ul className="flex flex-col gap-1.5">
            {alertas.map((a, i) => (
              <li key={`${a.clienteId}-${i}`}>
                <Link
                  href={`/admin/tenants/${a.clienteId}`}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:opacity-90 ${
                    a.nivel === "urgente"
                      ? "border-red-900 bg-red-950/50 text-red-200"
                      : "border-amber-900 bg-amber-950/40 text-amber-200"
                  }`}
                >
                  <span className="font-semibold">{a.nivel === "urgente" ? "Urgente" : "Atenção"}</span>
                  <span className="font-medium">{a.nome}</span>
                  <span className="opacity-80">— {a.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          rotulo="Receita recorrente (MRR)"
          valor={centsToBRL(resumo.mrrCents)}
          nota={`${pagantes} cliente(s) pagante(s)`}
        />
        <Kpi rotulo="Anualizado (ARR)" valor={centsToBRL(resumo.arrCents)} />
        <Kpi
          rotulo="Em teste"
          valor={String(resumo.porSituacao.TRIAL)}
          nota={resumo.porSituacao.SEM_ASSINATURA > 0 ? `${resumo.porSituacao.SEM_ASSINATURA} sem assinatura` : undefined}
        />
        <Kpi
          rotulo="Nunca ativaram"
          valor={String(resumo.semAtivacao)}
          nota={resumo.inadimplentes > 0 ? `${resumo.inadimplentes} inadimplente(s)` : "ninguém devendo"}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-200">Clientes</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950/60 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Empresa</th>
                <th className="px-4 py-2 text-left font-medium">Plano</th>
                <th className="px-4 py-2 text-left font-medium">Situação</th>
                <th className="px-4 py-2 text-left font-medium">Uso</th>
                <th className="px-4 py-2 text-right font-medium">Mensal</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/tenants/${c.id}`} className="font-medium text-emerald-400 hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-300">
                    {c.plano ? PLANO[c.plano] : "—"}
                    {/* A regra antiga fica visível na lista: é o que explica
                        por que um Essencial tem setores e pedidos. */}
                    {c.plataformaCompleta && (
                      <span className="ml-1.5 text-[11px] text-neutral-400" title="Contratou quando todo plano tinha a plataforma completa">
                        · completa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-300">
                    {SITUACAO[c.situacao]}
                    {c.situacao === "TRIAL" && c.diasDeTeste !== null && (
                      <span className={`ml-1.5 text-xs ${c.diasDeTeste < 0 ? "text-red-400" : "text-neutral-500"}`}>
                        {c.diasDeTeste < 0 ? `acabou há ${-c.diasDeTeste}d` : `${c.diasDeTeste}d restantes`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${ATIVACAO[c.ativacao].classe}`}>
                      {ATIVACAO[c.ativacao].rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                    {c.mensalCents ? centsToBRL(c.mensalCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
