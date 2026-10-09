import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { CaixaPanel } from "./caixa-panel";

export default async function CaixaPage() {
  const user = await requireUser();
  // O caixa é o dinheiro da empresa: leitura e operação da gestão.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold">Contas a receber</h1>
        <nav className="flex gap-1 text-sm">
          <Link href="/receber" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            A receber
          </Link>
          <span className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">Caixa</span>
        </nav>
      </div>
      <CaixaPanel />
    </div>
  );
}
