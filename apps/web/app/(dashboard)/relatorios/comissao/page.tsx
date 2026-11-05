import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { NavRelatorios } from "../nav-relatorios";
import { ComissaoPanel } from "./comissao-panel";

export default async function RelatorioComissaoPage() {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h1 className="text-lg font-semibold">Relatórios</h1>
        <NavRelatorios ativa="comissao" gestao={ehGerencia(user.role)} />
      </div>
      <ComissaoPanel />
    </div>
  );
}
