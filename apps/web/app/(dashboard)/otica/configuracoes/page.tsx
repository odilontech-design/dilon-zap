import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { AbasOtica } from "../abas-otica";
import { ConfigOtica } from "./config-otica";

export default async function ConfigOticaPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("OTICA")) redirect("/painel");
  if (!ehGerencia(user.role)) redirect("/otica");
  return (
    <div className="p-4 md:p-8">
      <AbasOtica atual="configuracoes" role={user.role} />
      <ConfigOtica />
    </div>
  );
}
