import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { PagarPanel } from "./pagar-panel";

export default async function PagarPage() {
  const user = await requireUser();
  // Quanto a empresa deve a quem: informação de gestão.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold">Financeiro</h1>
        <nav className="flex gap-1 text-sm">
          <Link href="/receber" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            A receber
          </Link>
          <span className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">A pagar</span>
          <Link href="/caixa" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            Caixa
          </Link>
        </nav>
      </div>
      <PagarPanel />
    </div>
  );
}
