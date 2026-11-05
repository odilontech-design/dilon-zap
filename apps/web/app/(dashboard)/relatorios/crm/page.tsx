import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { NavRelatorios } from "../nav-relatorios";
import { CrmReportsPanel } from "./crm-reports-panel";

export default async function RelatoriosCrmPage() {
  const user = await requireUser();
  // Mostra o desempenho de cada pessoa: é leitura da gestão.
  if (!ehGerencia(user.role)) redirect("/relatorios");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h1 className="text-lg font-semibold">Relatórios</h1>
        <NavRelatorios ativa="crm" gestao />
      </div>
      <CrmReportsPanel />
    </div>
  );
}
