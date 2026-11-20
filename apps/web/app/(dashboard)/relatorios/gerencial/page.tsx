import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { NavRelatorios } from "../nav-relatorios";
import { GerencialPanel } from "./gerencial-panel";

export default async function RelatorioGerencialPage() {
  const user = await requireUser();
  // Números da empresa inteira (vendas por consultora, caixa, contas): leitura da gestão.
  if (!ehGerencia(user.role)) redirect("/relatorios");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h1 className="text-lg font-semibold">Relatórios</h1>
        <NavRelatorios ativa="gerencial" gestao />
      </div>
      <GerencialPanel />
    </div>
  );
}
