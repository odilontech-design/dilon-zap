import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { AbasFinanceiro } from "@/components/abas-financeiro";
import { CaixaPanel } from "./caixa-panel";

export default async function CaixaPage() {
  const user = await requireUser();
  // O caixa é o dinheiro da empresa: leitura e operação da gestão.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <AbasFinanceiro atual="caixa" user={user} />
      <CaixaPanel />
    </div>
  );
}
