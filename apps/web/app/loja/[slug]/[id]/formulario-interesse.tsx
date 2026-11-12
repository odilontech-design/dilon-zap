"use client";

import { useState } from "react";
import { registrarContato } from "../rastreio";

/**
 * "Prefere que a gente chame?": para quem não quer abrir o WhatsApp agora.
 * Vira negociação no CRM da loja com a tarefa de chamar o cliente.
 */
export function FormularioInteresse({ slug, veiculoId, valorCents }: { slug: string; veiculoId: string; valorCents: number }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [site, setSite] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "feito">("livre");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEstado("enviando");
    const r = await fetch(`/api/loja/${slug}/interesse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, telefone, mensagem: mensagem || null, veiculoId, site }),
    });
    if (!r.ok) {
      setErro((await r.json().catch(() => null))?.error ?? "não deu para enviar, tente de novo");
      setEstado("livre");
      return;
    }
    registrarContato("formulario", valorCents);
    setEstado("feito");
  }

  if (estado === "feito") {
    return <p className="rounded-xl border border-neutral-200 bg-surface p-5 text-sm">Recebemos seu contato. Um vendedor vai chamar você no WhatsApp em breve.</p>;
  }
  const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm";
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-surface p-5">
      <h2 className="text-sm font-semibold">Prefere que a gente chame você?</h2>
      <input aria-label="Seu nome" required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" className={campo} />
      <input aria-label="Seu WhatsApp" required value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
      <textarea aria-label="Mensagem" rows={2} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Quer dar seu carro na troca? Prefere financiar? (opcional)" className={campo} />
      {/* Armadilha para robô: invisível para gente. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={site} onChange={(e) => setSite(e.target.value)} name="site" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <button disabled={estado === "enviando"} className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {estado === "enviando" ? "Enviando…" : "Quero ser chamado"}
      </button>
    </form>
  );
}
