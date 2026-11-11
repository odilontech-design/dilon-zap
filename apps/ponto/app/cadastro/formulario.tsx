"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Botao, Campo, Entrada } from "@/components/campos";
import { criarConta } from "./acoes";

export function FormularioCadastro() {
  const router = useRouter();
  const [f, setF] = useState({ razaoSocial: "", cnpj: "", nome: "", email: "", senha: "", aceite: false });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const muda = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await criarConta({ ...f, aceite: f.aceite as true });
    if (!r.ok) {
      setErro(r.erro);
      setEnviando(false);
      return;
    }
    await signIn("credentials", { login: f.email, password: f.senha, redirect: false });
    router.push("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <h2 className="font-semibold text-neutral-900">Dados da empresa</h2>
      <Campo rotulo="Razão social">
        <Entrada required value={f.razaoSocial} onChange={muda("razaoSocial")} />
      </Campo>
      <Campo rotulo="CNPJ">
        <Entrada required inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={muda("cnpj")} />
      </Campo>
      <h2 className="font-semibold text-neutral-900 pt-2">Administrador</h2>
      <Campo rotulo="Seu nome">
        <Entrada required value={f.nome} onChange={muda("nome")} />
      </Campo>
      <Campo rotulo="Email">
        <Entrada type="email" required autoComplete="username" value={f.email} onChange={muda("email")} />
      </Campo>
      <Campo rotulo="Senha" ajuda="Pelo menos 6 caracteres.">
        <Entrada type="password" required minLength={6} autoComplete="new-password" value={f.senha} onChange={muda("senha")} />
      </Campo>
      <label className="flex gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={f.aceite} onChange={muda("aceite")} className="mt-0.5" />
        <span>Li e aceito os termos de uso e a política de privacidade.</span>
      </label>
      {erro && <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
      <Botao type="submit" disabled={enviando} className="w-full py-2.5">
        {enviando ? "Criando a conta…" : "Contratar e começar"}
      </Botao>
    </form>
  );
}
