"use client";

import { useState } from "react";
import useSWR from "swr";

type Usuario = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "AGENT" | "FINANCEIRO";
  createdAt: string;
  deactivatedAt: string | null;
};

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("falha ao carregar usuários");
  return res.json();
}

const PAPEL_LABEL: Record<Usuario["role"], string> = {
  OWNER: "Responsável",
  AGENT: "Atendente",
  FINANCEIRO: "Financeiro",
};

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function UsersPanel({ meuId }: { meuId: string }) {
  const { data: usuarios, mutate } = useSWR<Usuario[]>("/api/users?incluirInativos=1", fetcher);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(url: string, method: string, body: unknown) {
    setErro(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof dados.error === "string" ? dados.error : "não deu pra concluir");
      return null;
    }
    mutate();
    return dados;
  }

  async function alternarAtivo(u: Usuario) {
    const desativando = !u.deactivatedAt;
    if (desativando) {
      const ok = confirm(
        `Desativar ${u.name}?\n\n` +
          `Ela perde o acesso e sai da lista de atribuição. As conversas abertas na mão dela ficam sem responsável, ` +
          `pra alguém assumir.\n\n` +
          `O histórico continua com o nome dela em tudo que já respondeu. Dá pra reativar depois.`
      );
      if (!ok) return;
    }
    const r = await chamar(`/api/users/${u.id}`, "PATCH", { ativo: !desativando });
    if (r && desativando && r.desatribuidas > 0) {
      alert(`${r.desatribuidas} conversa(s) que estavam com ${u.name} ficaram sem responsável.`);
    }
  }

  async function redefinirSenha(u: Usuario) {
    const nova = prompt(`Nova senha para ${u.name} (mínimo 8 caracteres):`);
    if (!nova) return;
    if (nova.length < 8) {
      setErro("a senha precisa ter pelo menos 8 caracteres");
      return;
    }
    const r = await chamar(`/api/users/${u.id}`, "PATCH", { password: nova });
    if (r) alert(`Senha de ${u.name} redefinida. Passe a nova senha pra ela.`);
  }

  const ativos = (usuarios ?? []).filter((u) => !u.deactivatedAt);

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <button
          onClick={() => setCriando(true)}
          className="rounded-md bg-accent text-white px-4 py-2 text-sm font-medium shrink-0"
        >
          Novo usuário
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-5">
        {ativos.length} ativo{ativos.length === 1 ? "" : "s"} de {usuarios?.length ?? 0}.
      </p>

      {erro && (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{erro}</p>
      )}

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nome</th>
              <th className="text-left font-medium px-4 py-2.5">E-mail</th>
              <th className="text-left font-medium px-4 py-2.5">Papel</th>
              <th className="text-left font-medium px-4 py-2.5">Desde</th>
              <th className="text-right font-medium px-4 py-2.5">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(usuarios ?? []).map((u) => {
              const inativo = Boolean(u.deactivatedAt);
              return (
                <tr key={u.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-4 py-3">
                    <span className={inativo ? "text-neutral-400" : "font-medium text-neutral-800"}>{u.name}</span>
                    {u.id === meuId && <span className="ml-2 text-xs text-neutral-400">(você)</span>}
                    {inativo && (
                      <span className="ml-2 text-[10px] rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5">
                        desativada em {formatarData(u.deactivatedAt!)}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${inativo ? "text-neutral-400" : "text-neutral-600"}`}>{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={inativo}
                      onChange={(e) => chamar(`/api/users/${u.id}`, "PATCH", { role: e.target.value })}
                      className="rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm disabled:opacity-50"
                    >
                      <option value="AGENT">{PAPEL_LABEL.AGENT}</option>
                      <option value="FINANCEIRO">{PAPEL_LABEL.FINANCEIRO}</option>
                      <option value="OWNER">{PAPEL_LABEL.OWNER}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-neutral-500 tabular-nums">{formatarData(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => redefinirSenha(u)}
                      disabled={inativo}
                      className="text-neutral-600 hover:text-accent disabled:opacity-40 mr-4"
                    >
                      Redefinir senha
                    </button>
                    <button
                      onClick={() => alternarAtivo(u)}
                      className={inativo ? "text-accent" : "text-red-600 hover:text-red-700"}
                    >
                      {inativo ? "Reativar" : "Desativar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        Quem sai da empresa deve ser <strong>desativado</strong>, não excluído: assim ela perde o acesso na hora e o
        histórico continua mostrando quem atendeu cada cliente.
      </p>

      {criando && (
        <NovoUsuario
          onFechar={() => setCriando(false)}
          onCriado={() => {
            setCriando(false);
            mutate();
          }}
          onErro={setErro}
        />
      )}
    </div>
  );
}

function NovoUsuario({
  onFechar,
  onCriado,
  onErro,
}: {
  onFechar: () => void;
  onCriado: () => void;
  onErro: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "AGENT" | "FINANCEIRO">("AGENT");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onErro(typeof body.error === "string" ? body.error : "não deu pra criar o usuário");
      return;
    }
    onCriado();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 p-6 w-full max-w-md"
      >
        <h2 className="text-lg font-semibold mb-4">Novo usuário</h2>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm mb-3">
          <span className="text-neutral-700">Senha provisória</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
          <span className="text-xs text-neutral-500">Mínimo 8 caracteres. Passe pra pessoa e peça pra trocar.</span>
        </label>

        <label className="block text-sm mb-5">
          <span className="text-neutral-700">Papel</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "OWNER" | "AGENT" | "FINANCEIRO")}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          >
            <option value="AGENT">Atendente — atende conversas</option>
            <option value="OWNER">Responsável — atende e gerencia a conta</option>
          </select>
        </label>

        <div className="flex justify-end gap-3 text-sm">
          <button type="button" onClick={onFechar} className="px-4 py-2 text-neutral-600">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {salvando ? "Criando..." : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}
