"use client";

import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { ERP_PLANOS, resumoDosModulos, type ErpPlano } from "@/lib/erp-regras";

/**
 * Painel gerencial do ERP Dilon Contabilidade: todos os escritórios num só lugar,
 * com o que cada um paga, quanto usa do plano, o estado do termo de aceite e se
 * está bloqueado. Paleta escura do admin (ver saas-overview.tsx).
 */

type Termo = { versao: string | null; prazoEm: string | null; situacao: "NAO_EXIGIDO" | "ACEITO" | "PENDENTE" | "VENCIDO" | "RECUSADO"; bloqueado: boolean; diasRestantes: number | null };
type Linha = {
  tenantId: string; tenantNome: string; slug: string; loginUrl: string; plano: ErpPlano; mensalCents: number;
  statusLocal: "ATIVO" | "SUSPENSO"; suspensoMotivo: string | null; assinatura: string | null;
  limiteEmpresas: number | null; limiteUsuarios: number | null;
  empresasAtivas: number | null; usuariosEquipe: number | null; acessosPortal: number | null; ultimaAtividadeEm: string | null;
  aoVivo: boolean; termo: Termo | null; modulos?: string[] | null;
};
type SemVinculo = { slug: string; nome: string; ativo: boolean; empresasAtivas: number; usuariosEquipe: number; ultimaAtividadeEm: string | null; zapTenantId: string | null };
type Resposta = {
  resumo: { escritorios: number; ativos: number; suspensos: number; mrrCents: number; empresasCliente: number; usuarios: number; termosPendentes: number; termosBloqueados: number; semVinculo: number };
  escritorios: Linha[]; semVinculo: SemVinculo[]; aviso: string | null;
  contratacoes: { id: string; status: "AGUARDANDO_EMAIL" | "CRIANDO" | "CONCLUIDA" | "ERRO"; plano: ErpPlano; escritorioNome: string; email: string; telefone: string; criadoEm: string; expiraEm: string; erro: string | null; tenantId: string | null }[];
};
const STATUS_CONTRATACAO = {
  AGUARDANDO_EMAIL: { rotulo: "Aguardando e-mail", cor: "bg-amber-900/60 text-amber-300" },
  CRIANDO: { rotulo: "Criando", cor: "bg-sky-900/60 text-sky-300" },
  CONCLUIDA: { rotulo: "Concluída", cor: "bg-emerald-900/60 text-emerald-300" },
  ERRO: { rotulo: "Erro", cor: "bg-red-900/60 text-red-300" },
} as const;

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const TERMO = {
  NAO_EXIGIDO: { rotulo: "Sem termo", cor: "bg-neutral-800 text-neutral-300" },
  ACEITO: { rotulo: "Aceito", cor: "bg-emerald-900/60 text-emerald-300" },
  PENDENTE: { rotulo: "Aguardando", cor: "bg-amber-900/60 text-amber-300" },
  VENCIDO: { rotulo: "Vencido", cor: "bg-red-900/60 text-red-300" },
  RECUSADO: { rotulo: "Recusado", cor: "bg-red-900/60 text-red-300" },
} as const;

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const dia = (iso: string) => iso.split("-").reverse().join("/");

function Uso({ usado, limite }: { usado: number | null; limite: number | null }) {
  if (usado === null) return <span className="text-neutral-500">—</span>;
  const cheio = limite !== null && usado >= limite;
  return <span className={cheio ? "text-amber-300" : ""}>{usado}{limite !== null ? ` / ${limite}` : ""}</span>;
}

function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "alerta" }) {
  return (
    <div className={`rounded-lg border p-4 ${tom === "alerta" ? "border-amber-800 bg-amber-950/30" : "border-neutral-800 bg-neutral-900"}`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100">{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function PainelDoErp() {
  const { data, isLoading } = useSWR<Resposta>("/api/admin/erp", fetcher, { refreshInterval: 60_000 });
  if (isLoading || !data) return <div className="p-6 text-sm text-neutral-400">Carregando…</div>;
  const r = data.resumo;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-100">ERP Dilon Contabilidade</h1>
        <p className="text-xs text-neutral-500">Escritórios que usam o ERP: cobrança, uso do plano, termo de aceite e bloqueio.</p>
      </div>

      {data.aviso && <p className="rounded-md bg-amber-950/50 p-3 text-xs text-amber-300">{data.aviso} Mostrando o último uso guardado.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Receita mensal do ERP" valor={centsToBRL(r.mrrCents)} sub={`${r.ativos} escritório(s) ativo(s) · ${centsToBRL(r.mrrCents * 12)}/ano`} />
        <Kpi rotulo="Empresas-cliente" valor={String(r.empresasCliente)} sub={`${r.usuarios} usuário(s) da equipe`} />
        <Kpi rotulo="Termos pendentes" valor={String(r.termosPendentes)} sub="aguardando aceite" tom={r.termosPendentes ? "alerta" : undefined} />
        <Kpi rotulo="Bloqueados pelo termo" valor={String(r.termosBloqueados)} sub={`${r.suspensos} suspenso(s) por cobrança`} tom={r.termosBloqueados ? "alerta" : undefined} />
      </div>

      <section className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        {data.escritorios.length === 0 ? (
          <p className="p-4 text-sm text-neutral-400">Nenhum escritório ativado ainda. Ative o ERP na ficha de uma empresa.</p>
        ) : (
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="border-b border-neutral-800 text-neutral-500">
              <tr><th className="p-3">Escritório</th><th className="p-3">Plano</th><th className="p-3">Empresas</th><th className="p-3">Usuários</th><th className="p-3">Última atividade</th><th className="p-3">Termo</th><th className="p-3">Situação</th></tr>
            </thead>
            <tbody>
              {data.escritorios.map((e) => {
                const t = e.termo ? TERMO[e.termo.situacao] : null;
                return (
                  <tr key={e.tenantId} className="border-t border-neutral-800 align-top">
                    <td className="p-3">
                      <Link href={`/admin/tenants/${e.tenantId}`} className="font-medium text-emerald-400 hover:underline">{e.tenantNome}</Link>
                      <div className="text-neutral-500">código {e.slug}</div>
                    </td>
                    <td className="p-3">{ERP_PLANOS[e.plano].nome}<div className="text-neutral-500">{centsToBRL(e.mensalCents)}/mês</div>{e.modulos !== undefined && <div className="mt-1 max-w-[16rem] text-neutral-500">{resumoDosModulos(e.modulos)}</div>}</td>
                    <td className="p-3"><Uso usado={e.empresasAtivas} limite={e.limiteEmpresas} /></td>
                    <td className="p-3"><Uso usado={e.usuariosEquipe} limite={e.limiteUsuarios} /></td>
                    <td className="p-3">{e.ultimaAtividadeEm ? dataBR(e.ultimaAtividadeEm) : "—"}{!e.aoVivo && <div className="text-neutral-600">desatualizado</div>}</td>
                    <td className="p-3">
                      {t ? <span className={`rounded px-2 py-0.5 ${t.cor}`}>{t.rotulo}</span> : <span className="text-neutral-600">—</span>}
                      {e.termo?.prazoEm && e.termo.situacao === "PENDENTE" && <div className="mt-1 text-neutral-500">até {dia(e.termo.prazoEm)}{e.termo.diasRestantes !== null ? ` (${e.termo.diasRestantes}d)` : ""}</div>}
                    </td>
                    <td className="p-3">
                      {e.termo?.bloqueado ? <span className="rounded bg-red-900/60 px-2 py-0.5 text-red-300">Bloqueado</span> : e.statusLocal === "SUSPENSO" ? <span className="rounded bg-red-900/60 px-2 py-0.5 text-red-300">Suspenso</span> : <span className="rounded bg-emerald-900/60 px-2 py-0.5 text-emerald-300">Ativo</span>}
                      {e.statusLocal === "SUSPENSO" && e.suspensoMotivo && <div className="mt-1 text-neutral-500">{e.suspensoMotivo}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {data.contratacoes.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <h2 className="p-4 pb-2 text-sm font-medium text-neutral-200">Contratações online</h2>
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-neutral-800 text-neutral-500"><tr><th className="p-3">Quando</th><th className="p-3">Escritório</th><th className="p-3">Plano</th><th className="p-3">Contato</th><th className="p-3">Situação</th></tr></thead>
            <tbody>
              {data.contratacoes.map((c) => (
                <tr key={c.id} className="border-t border-neutral-800 align-top">
                  <td className="p-3">{new Date(c.criadoEm).toLocaleString("pt-BR")}</td>
                  <td className="p-3">{c.tenantId ? <Link href={`/admin/tenants/${c.tenantId}`} className="font-medium text-emerald-400 hover:underline">{c.escritorioNome}</Link> : c.escritorioNome}</td>
                  <td className="p-3">{ERP_PLANOS[c.plano].nome}</td>
                  <td className="p-3">{c.email}<div className="text-neutral-500">{c.telefone}</div></td>
                  <td className="p-3"><span className={`rounded px-2 py-0.5 ${STATUS_CONTRATACAO[c.status].cor}`}>{STATUS_CONTRATACAO[c.status].rotulo}</span>{c.erro && <div className="mt-1 max-w-[18rem] text-neutral-400">{c.erro}</div>}{c.status === "AGUARDANDO_EMAIL" && <div className="mt-1 text-neutral-500">link vale até {new Date(c.expiraEm).toLocaleString("pt-BR")}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.semVinculo.length > 0 && (
        <section className="rounded-lg border border-amber-800 bg-amber-950/20 p-4">
          <h2 className="mb-1 text-sm font-medium text-amber-300">Escritórios no ERP sem empresa ligada no Zap</h2>
          <p className="mb-3 text-xs text-neutral-400">Estes escritórios existem no ERP mas não aparecem acima, então ficam fora da cobrança e do painel. Para ligar: abra a ficha da empresa correspondente, ative o ERP e informe o código do escritório.</p>
          <ul className="space-y-1 text-xs">
            {data.semVinculo.map((s) => (
              <li key={s.slug} className="flex flex-wrap gap-x-4 text-neutral-300">
                <strong>{s.nome}</strong> <span className="text-neutral-500">código {s.slug}</span>
                <span>{s.empresasAtivas} empresa(s) · {s.usuariosEquipe} usuário(s)</span>
                <span className="text-neutral-500">{s.ultimaAtividadeEm ? `última atividade ${dataBR(s.ultimaAtividadeEm)}` : "sem atividade"}</span>
                {!s.ativo && <span className="text-red-300">suspenso</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
