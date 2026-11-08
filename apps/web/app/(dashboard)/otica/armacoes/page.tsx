import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { AbasOtica } from "../abas-otica";
import { ArmacoesPanel } from "./armacoes-panel";

export default async function ArmacoesPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("OTICA")) redirect("/painel");
  return (
    <div className="p-4 md:p-8">
      <AbasOtica atual="armacoes" role={user.role} />
      <ArmacoesPanel />
    </div>
  );
}
