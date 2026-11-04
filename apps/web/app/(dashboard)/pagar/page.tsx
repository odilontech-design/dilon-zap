import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { AbasFinanceiro } from "@/components/abas-financeiro";
import { PagarPanel } from "./pagar-panel";

export default async function PagarPage() {
  const user = await requireUser();
  // Quanto a empresa deve a quem: informação de gestão.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <AbasFinanceiro atual="pagar" user={user} />
      <PagarPanel />
    </div>
  );
}
