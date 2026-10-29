import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { AbasFinanceiro } from "@/components/abas-financeiro";
import { CategoriasPanel } from "./categorias-panel";

export default async function CategoriasPage() {
  const user = await requireUser();
  // Quanto entrou e saiu por categoria: informação de gestão, como o resto do financeiro.
  if (!ehGerencia(user.role)) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <AbasFinanceiro atual="categorias" user={user} />
      <CategoriasPanel />
    </div>
  );
}
