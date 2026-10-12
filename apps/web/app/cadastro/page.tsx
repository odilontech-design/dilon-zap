import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { numeroDoComercial } from "@/lib/suporte";
import { FormularioCadastro } from "@/components/formulario-cadastro";
import { LogoDilon } from "../login/logo-dilon";

/**
 * Página de cadastro do teste grátis — o destino do anúncio e do link que a
 * Dilon Tech manda no WhatsApp.
 *
 * Existe separada do /login porque lá o formulário fica recolhido no fim da
 * coluna (de propósito: a tela é de quem trabalha todo dia). Mandar o lead do
 * anúncio pro /login obrigava a pessoa a rolar, achar o botão e abrir o
 * formulário — no celular, vários não achavam. Aqui o formulário é a página.
 *
 * Pública, sem nada de área logada. Sem número comercial configurado (instalação
 * white-label), a página não existe: é o mesmo critério da tela de login.
 */

export const metadata: Metadata = {
  title: "Teste o Dilon Zap grátis por 14 dias",
  description:
    "Sua equipe inteira atendendo no mesmo WhatsApp, com funil, pedidos e relatórios. 14 dias grátis, sem cartão.",
};

const BENEFICIOS = [
  "Vários atendentes no mesmo número, cada um com seu login",
  "Funil de vendas e pedidos dentro da conversa",
  "Conecta pelo QR Code, sem trocar de chip",
];

export default async function CadastroPage() {
  // Quem já está logado não tem o que fazer aqui.
  const session = await getServerSession(authOptions);
  if (session) redirect("/painel");

  const numero = numeroDoComercial();
  if (!numero) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-8">
        <a href="https://dilontech.com.br/zap" className="w-fit" aria-label="Conhecer o Dilon Zap">
          <LogoDilon />
        </a>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900">
            Sua equipe inteira num só WhatsApp.{" "}
            <span className="text-accent">Teste grátis.</span>
          </h1>
          <ul className="flex flex-col gap-1.5 text-sm text-neutral-600">
            {BENEFICIOS.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden className="text-accent">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <FormularioCadastro numero={numero} />

        <p className="text-center text-xs text-neutral-500">
          Já é cliente?{" "}
          <a href="/login" className="font-medium text-accent underline underline-offset-4">
            Entrar
          </a>
        </p>
      </div>
    </div>
  );
}
