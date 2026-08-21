import { requireRecurso } from "@/lib/session";
import { podeVerFinanceiro } from "@/lib/papeis";
import { redirect } from "next/navigation";
import { PainelFinanceiro } from "./painel-financeiro";

export default async function FinanceiroPage() {
  const usuario = await requireRecurso("FINANCEIRO");
  // Trava de PAPEL além da trava de plano: a empresa pode ter o recurso e o
  // vendedor continuar sem enxergar o caixa da casa.
  if (!podeVerFinanceiro(usuario.papel)) redirect("/painel");

  return <PainelFinanceiro />;
}
