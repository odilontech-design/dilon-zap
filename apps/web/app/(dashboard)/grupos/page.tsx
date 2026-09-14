import { requireUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { GruposView } from "./grupos-view";

export default async function GruposPage() {
  const user = await requireUser();

  // O menu já esconde o item fora do plano; isto cobre quem chega pelo link.
  // A barreira de verdade continua sendo as rotas /api/grupos.
  if (!(await recursosDoTenant(user.tenantId)).has("GRUPOS")) {
    return (
      <div className="p-6 text-sm text-neutral-600">
        Grupos do WhatsApp não fazem parte do plano desta empresa.
      </div>
    );
  }

  return <GruposView ehFinanceiro={user.role === "OWNER" || user.role === "FINANCEIRO"} />;
}
