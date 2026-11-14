import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { SitePanel } from "./site-panel";

export default async function SitePage() {
  const user = await requireUser();
  // O recurso e a gestão: quem não tem volta ao painel. A barreira de verdade é a rota (/api/painel-ecommerce).
  if (!ehGerencia(user.role) || (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("PAINEL_ECOMMERCE"))) redirect("/painel");
  return (
    <div className="p-4 md:p-8">
      <SitePanel />
    </div>
  );
}
