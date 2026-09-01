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
 *
 * Todos os campos são obrigatórios porque a mensagem existe pra virar cadastro
 * do outro lado: faltando um dado, alguém tem que voltar e perguntar, e cada
 * ida e volta é uma chance de o interessado esfriar. O e-mail em especial é o
 * que vira o login — sem ele não há conta pra criar.
 */
export function SolicitarAcesso({ numero }: { numero: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [equipe, setEquipe] = useState("");

  // Validação frouxa de propósito: o navegador já barra o formato pelo
  // type="email", e o que importa aqui é não deixar passar um campo vazio.
  // Regra de e-mail rigorosa demais rejeita endereço válido e trava a venda.
  const emailParecePreenchido = /.+@.+\..+/.test(email.trim());
  const podeEnviar =
    nome.trim().length > 1 &&
    empresa.trim().length > 1 &&
    emailParecePreenchido &&
    telefone.trim().length >= 8 &&
    equipe.trim().length > 0;

  function abrirWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;

    // Texto em primeira pessoa: quem envia é a pessoa, e a mensagem tem que
    // soar como ela escreveu. A ordem segue o que o cadastro precisa.
    const texto = [
      "Olá! Quero conhecer o Dilon Zap.",
      "",
      `Nome: ${nome.trim()}`,
      `Empresa: ${empresa.trim()}`,
      `E-mail para acesso: ${email.trim()}`,
      `Telefone: ${telefone.trim()}`,
      `Pessoas no atendimento: ${equipe.trim()}`,
    ].join("\n");

    window.open(linkComMensagem(numero, texto), "_blank", "noopener,noreferrer");
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
        <span className="font-medium text-neutral-700">E-mail</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@suaempresa.com.br"
          className={campo}
        />
        {/* Diz pra que serve antes de a pessoa digitar: e-mail que vira login
            merece ser escolhido com cuidado, e trocar depois dá trabalho. */}
        <span className="text-xs text-neutral-500">Será o seu login no sistema.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Telefone</span>
        <input
          required
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          inputMode="tel"
          placeholder="(21) 99999-9999"
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Quantas pessoas atendem</span>
        <input
          required
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
