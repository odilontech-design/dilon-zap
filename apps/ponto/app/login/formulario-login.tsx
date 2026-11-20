"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Botao, Campo, Entrada } from "@/components/campos";

export function FormularioLogin() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await signIn("credentials", { login, password: senha, redirect: false });
    if (r?.error) {
      setErro(
        r.error.includes("BANCO_INDISPONIVEL")
          ? "Não foi possível falar com o banco de dados. Se a instalação é nova, confira /api/saude."
          : "Login ou senha incorretos.",
      );
      setEnviando(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Email ou CPF" ajuda="Colaborador entra com o CPF.">
        <Entrada required autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
      </Campo>
      <Campo rotulo="Senha">
        <Entrada type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      {erro && <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
      <Botao type="submit" disabled={enviando} className="w-full py-2.5">
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>
    </form>
  );
}
