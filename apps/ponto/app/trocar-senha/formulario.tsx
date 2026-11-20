"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Botao, Campo, Entrada } from "@/components/campos";
import { trocarSenha } from "./acoes";

export function FormularioTrocarSenha() {
  const router = useRouter();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nova !== confirma) return setErro("A confirmação não bate com a nova senha.");
    setEnviando(true);
    const r = await trocarSenha(atual, nova);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Senha atual (ou provisória)">
        <Entrada type="password" required autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      </Campo>
      <Campo rotulo="Nova senha" ajuda="Pelo menos 6 caracteres.">
        <Entrada type="password" required minLength={6} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      </Campo>
      <Campo rotulo="Repita a nova senha">
        <Entrada type="password" required autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
      </Campo>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <Botao type="submit" disabled={enviando} className="w-full">
        {enviando ? "Salvando…" : "Salvar senha"}
      </Botao>
    </form>
  );
}
