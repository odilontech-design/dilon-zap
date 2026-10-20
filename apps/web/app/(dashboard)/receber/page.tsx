import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { AbasFinanceiro } from "@/components/abas-financeiro";
import { ContasPanel } from "./contas-panel";

export default async function ReceberPage() {
  const user = await requireUser();

  // Atendente não tem o que fazer aqui: a lista é de gestão, e mostrar quanto
  // cada cliente deve pra quem só atende é informação sem uso e com peso.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <AbasFinanceiro atual="receber" user={user} />
      <ContasPanel />
    </div>
  );
}
