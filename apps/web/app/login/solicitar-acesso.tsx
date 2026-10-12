"use client";

import { useState } from "react";
import { FormularioCadastro } from "@/components/formulario-cadastro";

/**
 * Autocadastro, abaixo do formulário de entrada.
 *
 * Continua recolhido por padrão: quem trabalha aqui todo dia não pode ter um
 * formulário de vendas empurrando o campo de senha pra baixo.
 *
 * O formulário em si mora em components/formulario-cadastro, compartilhado
 * com a página /cadastro — é pra lá que o anúncio e o WhatsApp mandam o lead,
 * sem precisar achar este botão no fim da tela de login.
 */
export function SolicitarAcesso({ numero }: { numero: string }) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-accent hover:text-accent"
      >
        Quero testar grátis por 14 dias
      </button>
    );
  }

  return <FormularioCadastro numero={numero} aoFechar={() => setAberto(false)} />;
}
