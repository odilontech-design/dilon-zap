"use client";

import { useState } from "react";
import { linkComMensagem } from "@/lib/suporte";

/**
 * Pedido de acesso, abaixo do formulário de entrada.
 *
 * Não grava nada e não manda e-mail: monta uma mensagem de WhatsApp já
 * preenchida e abre a conversa. A pessoa revisa e envia — quem dispara é ela,
 * não a página. Menos peça pra manter, e a conversa começa no canal que o
 * produto usa.
 *
 * Fica recolhido por padrão. Quem trabalha aqui todo dia não pode ter um
 * formulário de vendas empurrando o campo de senha pra baixo.
 */
export function SolicitarAcesso({ numero }: { numero: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [equipe, setEquipe] = useState("");

  const podeEnviar = nome.trim().length > 1 && empresa.trim().length > 1;

  function abrirWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;

    // Texto em primeira pessoa: quem envia é a pessoa, e a mensagem tem que
    // soar como ela escreveu.
    const linhas = [
      "Olá! Quero conhecer o Dilon Zap.",
      "",
      `Nome: ${nome.trim()}`,
      `Empresa: ${empresa.trim()}`,
    ];
    if (telefone.trim()) linhas.push(`Telefone: ${telefone.trim()}`);
    if (equipe.trim()) linhas.push(`Pessoas no atendimento: ${equipe.trim()}`);

    window.open(linkComMensagem(numero, linhas.join("\n")), "_blank", "noopener,noreferrer");
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-accent hover:text-accent"
      >
        Quero conhecer o Dilon Zap
      </button>
    );
  }

  const campo =
    "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={abrirWhatsApp} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Solicitar acesso</p>
          <p className="text-xs text-neutral-500">Abrimos o WhatsApp com seus dados já preenchidos.</p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 text-xs text-neutral-500 hover:text-neutral-800"
        >
          Fechar
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Seu nome</span>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Empresa</span>
        <input required value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={campo} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">
          Telefone <span className="font-normal text-neutral-400">(opcional)</span>
        </span>
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          inputMode="tel"
          placeholder="(21) 99999-9999"
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">
          Quantas pessoas atendem <span className="font-normal text-neutral-400">(opcional)</span>
        </span>
        <input
          value={equipe}
          onChange={(e) => setEquipe(e.target.value)}
          inputMode="numeric"
          placeholder="3"
          className={campo}
        />
      </label>

      <button
        type="submit"
        disabled={!podeEnviar}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
      >
        Abrir no WhatsApp
      </button>

      <p className="text-[11px] leading-relaxed text-neutral-500">
        Nada é gravado aqui. A mensagem abre no seu WhatsApp e só sai quando você enviar.
      </p>
    </form>
  );
}
