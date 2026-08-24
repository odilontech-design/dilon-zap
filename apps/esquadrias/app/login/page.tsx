import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BotaoSuporte } from "@/components/botao-suporte";
import { FormularioLogin } from "./formulario-login";

// Página atrás de autenticação: o conteúdo depende da sessão de quem pediu, e
// por isso nunca pode ser gerada estaticamente no build. Sem esta linha o Next
// tenta pré-renderizar, e a compilação passa a depender das variáveis de
// autenticação estarem certas no ambiente de BUILD — um NEXTAUTH_URL vazio
// derruba o deploy inteiro com "Invalid URL", em vez de simplesmente falhar o
// login em runtime.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/painel");

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="h-11 w-11 rounded-xl bg-accent grid place-items-center text-white font-bold text-lg mb-4">E</div>
            <h1 className="text-2xl font-semibold text-neutral-900">Entrar</h1>
            <p className="text-sm text-neutral-500 mt-1">Gestão de vidros, esquadrias de alumínio e serralheria de ferro.</p>
          </div>
          <FormularioLogin />
          <BotaoSuporte />
        </div>
      </div>

      {/* Lado de apresentação. Some no celular porque ali a tela é pra
          entrar, não pra ler propaganda. */}
      <div className="hidden lg:flex flex-col justify-center gap-6 bg-neutral-900 text-neutral-100 p-12">
        <h2 className="text-3xl font-semibold leading-tight">
          Do vão medido
          <br />
          ao plano de corte.
        </h2>
        <ul className="space-y-3 text-neutral-300">
          {[
            "Tipologias paramétricas: você cadastra a SUA linha de perfil e as suas fórmulas de corte.",
            "Orçamento com custo, margem e preço abertos na mesma tela.",
            "Relação de materiais e otimização de barras de 6 metros.",
            "Financeiro, agenda e obras ligados ao orçamento aprovado.",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="text-accent mt-0.5">✓</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
