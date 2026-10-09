import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { CrmReportsPanel } from "./crm-reports-panel";

export default async function RelatoriosCrmPage() {
  const user = await requireUser();
  // Mostra o desempenho de cada pessoa: é leitura da gestão.
  if (!ehGerencia(user.role)) redirect("/relatorios");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold">Relatórios</h1>
        <nav className="flex gap-1 text-sm">
          <Link href="/relatorios" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            Atendimento
          </Link>
          <span className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">CRM</span>
        </nav>
      </div>
      <CrmReportsPanel />
    </div>
  );
}
