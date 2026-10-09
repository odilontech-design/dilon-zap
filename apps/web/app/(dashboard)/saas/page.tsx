import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { recursosDoTenant } from "@/lib/plano";
import { SaasPanel } from "./saas-panel";

export default async function SaasPage() {
  const user = await requireUser();
  if (!ehGerencia(user.role)) redirect("/painel");

  // Recurso sob demanda: quem não tem não chega aqui. Quem barra de verdade é a
  // rota; isto só evita mostrar uma tela que daria erro. Superadmin passa.
  const recursos = await recursosDoTenant(user.tenantId);
  if (user.role !== "SUPERADMIN" && !recursos.has("FUNIL_SAAS")) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Indicadores de SaaS</h1>
      <SaasPanel />
    </div>
  );
}
