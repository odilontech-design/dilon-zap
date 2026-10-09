import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { ReportsPanel } from "./reports-panel";

export default async function RelatoriosPage() {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold">Relatórios</h1>
        {/* Os relatórios do CRM mostram o desempenho de cada pessoa: só a gestão os vê. */}
        {ehGerencia(user.role) && (
          <nav className="flex gap-1 text-sm">
            <span className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">Atendimento</span>
            <Link href="/relatorios/crm" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
              CRM
            </Link>
          </nav>
        )}
      </div>
      <ReportsPanel />
    </div>
  );
}
