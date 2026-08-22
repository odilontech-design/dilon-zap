import { requireRecurso } from "@/lib/session";
import { podeVerFinanceiro } from "@/lib/papeis";
import { redirect } from "next/navigation";
import { PainelFinanceiro } from "./painel-financeiro";

// Página atrás de autenticação: o conteúdo depende da sessão de quem pediu, e
// por isso nunca pode ser gerada estaticamente no build. Sem esta linha o Next
// tenta pré-renderizar, e a compilação passa a depender das variáveis de
// autenticação estarem certas no ambiente de BUILD — um NEXTAUTH_URL vazio
// derruba o deploy inteiro com "Invalid URL", em vez de simplesmente falhar o
// login em runtime.
export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const usuario = await requireRecurso("FINANCEIRO");
  // Trava de PAPEL além da trava de plano: a empresa pode ter o recurso e o
  // vendedor continuar sem enxergar o caixa da casa.
  if (!podeVerFinanceiro(usuario.papel)) redirect("/painel");

  return <PainelFinanceiro />;
}
