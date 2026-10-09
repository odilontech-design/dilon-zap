import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { ContasPanel } from "./contas-panel";

export default async function ReceberPage() {
  const user = await requireUser();

  // Atendente não tem o que fazer aqui: a lista é de gestão, e mostrar quanto
  // cada cliente deve pra quem só atende é informação sem uso e com peso.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-lg font-semibold">Financeiro</h1>
        <nav className="flex gap-1 text-sm">
          <span className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">A receber</span>
          <Link href="/pagar" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            A pagar
          </Link>
          <Link href="/caixa" className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
            Caixa
          </Link>
        </nav>
      </div>
      <ContasPanel />
    </div>
  );
}
