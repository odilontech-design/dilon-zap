"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    const resultado = await signIn("credentials", { email, password: senha, redirect: false });

    if (resultado?.error) {
      // Duas mensagens, e só duas. Credencial errada e usuário inexistente
      // compartilham o mesmo texto de propósito: distinguir os dois entrega
      // quais emails têm conta pra quem estiver testando de fora.
      //
      // Já falha de BANCO é outra coisa — não é problema de quem está
      // digitando, e chamá-la de "senha incorreta" manda a pessoa tentar
      // trocar a senha quando o que falta é terminar a instalação.
      setErro(
        resultado.error.includes("BANCO_INDISPONIVEL")
          ? "Não foi possível falar com o banco de dados. Se a instalação é nova, confira /api/saude."
          : "Email ou senha incorretos.",
      );
      setEnviando(false);
      return;
    }

    router.push("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-surface px-3 py-2.5 text-neutral-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1.5">Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-surface px-3 py-2.5 text-neutral-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
