"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatarDocumentoBR } from "@/lib/documento";

/**
 * Fila de autocadastros vindos da página de login.
 *
 * Aprovar CRIA a empresa na hora, com acesso do responsável e assinatura em
 * teste. A senha provisória aparece UMA vez, aqui — ela não fica guardada em
 * texto em lugar nenhum, então quem aprovar precisa copiar antes de fechar.
 */

type Solicitacao = {
  id: string;
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  documento: string;
  status: "PENDENTE" | "APROVADA" | "RECUSADA";
  motivo: string | null;
  criadoEm: string;
  decididoEm: string | null;
  decididoPor: { name: string } | null;
  tenant: { id: string; name: string } | null;
};

type Credenciais = { email: string; senha: string; empresa: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ROTULO_STATUS: Record<Solicitacao["status"], { texto: string; classe: string }> = {
  PENDENTE: { texto: "Aguardando", classe: "border-amber-900 bg-amber-950/50 text-amber-300" },
  APROVADA: { texto: "Aprovada", classe: "border-emerald-900 bg-emerald-950/50 text-emerald-300" },
  RECUSADA: { texto: "Recusada", classe: "border-neutral-700 text-neutral-500" },
};

export function SolicitacoesPanel() {
  const { data, mutate } = useSWR<Solicitacao[]>("/api/admin/solicitacoes", fetcher, {
    refreshInterval: 60_000,
  });
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  async function decidir(s: Solicitacao, acao: "aprovar" | "recusar") {
    if (acao === "aprovar") {
      if (!confirm(`Criar a empresa "${s.empresa}" e liberar o acesso de ${s.email}?`)) return;
    }
    const motivo = acao === "recusar" ? prompt("Motivo da recusa (opcional):") ?? "" : undefined;

    setOcupadoId(s.id);
    setErro(null);
    const res = await fetch(`/api/admin/solicitacoes/${s.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, motivo }),
    });
    setOcupadoId(null);

    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof b.error === "string" ? b.error : "não deu pra concluir");
      return;
    }
    if (acao === "aprovar" && b.senha) {
      setCredenciais({ email: b.email, senha: b.senha, empresa: s.empresa });
    }
    mutate();
  }

  if (!data) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!Array.isArray(data)) return <p className="text-sm text-red-400">não deu pra carregar</p>;

  const pendentes = data.filter((s) => s.status === "PENDENTE");

  return (
    <div>
      {erro && (
        <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{erro}</p>
      )}

      {credenciais && (
        <div className="mb-5 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
          <p className="text-sm font-medium text-emerald-200">
            {credenciais.empresa} criada. Passe estes dados ao cliente:
          </p>
          <p className="mt-2 font-mono text-sm text-emerald-100">{credenciais.email}</p>
          <p className="font-mono text-sm text-emerald-100">{credenciais.senha}</p>
          <p className="mt-2 text-xs text-emerald-300/80">
            A senha não fica guardada e não aparece de novo — copie antes de fechar. O responsável
            troca no primeiro acesso.
          </p>
          <button
            onClick={() => setCredenciais(null)}
            className="mt-3 rounded-md border border-emerald-700 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/40"
          >
            Já copiei
          </button>
        </div>
      )}

      <p className="mb-3 text-xs text-neutral-500">
        {pendentes.length === 0
          ? "Nenhum cadastro aguardando."
          : `${pendentes.length} cadastro(s) aguardando decisão.`}
      </p>

      <ul className="flex flex-col gap-2">
        {data.map((s) => {
          const rotulo = ROTULO_STATUS[s.status];
          return (
            <li key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-100">{s.empresa}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${rotulo.classe}`}>
                      {rotulo.texto}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300">{s.nome}</p>
                  <p className="text-xs text-neutral-400">
                    {s.email} · {s.telefone} · {formatarDocumentoBR(s.documento)}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Enviado em {new Date(s.criadoEm).toLocaleString("pt-BR")}
                    {s.decididoEm &&
                      ` · decidido por ${s.decididoPor?.name ?? "—"} em ${new Date(s.decididoEm).toLocaleString("pt-BR")}`}
                    {s.tenant && ` · empresa: ${s.tenant.name}`}
                  </p>
                  {s.motivo && <p className="mt-1 text-[11px] text-neutral-400">Motivo: {s.motivo}</p>}
                </div>

                {s.status === "PENDENTE" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => decidir(s, "recusar")}
                      disabled={ocupadoId === s.id}
                      className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Recusar
                    </button>
                    <button
                      onClick={() => decidir(s, "aprovar")}
                      disabled={ocupadoId === s.id}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
                    >
                      {ocupadoId === s.id ? "..." : "Aprovar e criar"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
