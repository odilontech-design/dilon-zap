"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { SENHA_MINIMO } from "@/lib/senha";

export function TrocarSenhaForm({ obrigatoria }: { obrigatoria: boolean }) {
  const router = useRouter();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    // Confere aqui e não no servidor: é erro de digitação, e ir até o banco
    // pra descobrir isso só atrasaria a resposta.
    if (nova !== repetida) {
      setErro("as duas senhas novas não são iguais");
      return;
    }

    setSalvando(true);
    const res = await fetch("/api/me/senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }),
    });
    setSalvando(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra trocar a senha agora");
      return;
    }
    router.push("/");
    router.refresh();
  }

  const campo =
    "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div>
        <label htmlFor="senha-atual" className="block text-sm font-medium text-neutral-700 mb-1">
          {obrigatoria ? "Senha provisória" : "Senha atual"}
        </label>
        <input
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="senha-nova" className="block text-sm font-medium text-neutral-700 mb-1">
          Nova senha
        </label>
        <input
          id="senha-nova"
          type="password"
          autoComplete="new-password"
          required
          minLength={SENHA_MINIMO}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          className={campo}
        />
        <p className="mt-1 text-xs text-neutral-500">Pelo menos {SENHA_MINIMO} caracteres.</p>
      </div>
      <div>
        <label htmlFor="senha-repetida" className="block text-sm font-medium text-neutral-700 mb-1">
          Repita a nova senha
        </label>
        <input
          id="senha-repetida"
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={campo}
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {salvando ? "Salvando..." : obrigatoria ? "Salvar e entrar" : "Salvar nova senha"}
      </button>

      {/* Na troca obrigatória não há painel pra voltar — a saída é sair da
          conta. Na voluntária, voltar sem trocar é o esperado. */}
      <div className="text-center text-sm text-neutral-500">
        {obrigatoria ? <SignOutButton /> : <Link href="/" className="hover:text-accent">Voltar sem trocar</Link>}
      </div>
    </form>
  );
}
