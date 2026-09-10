import { requireUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { AutomationsPanel } from "./automations-panel";
import { BusinessHoursPanel } from "./business-hours-panel";
import { UraPanel } from "./ura-panel";

export default async function AutomacoesPage() {
  const user = await requireUser();
  // Conferido aqui, no servidor, e não só escondido no cliente: o painel da URA
  // chama /api/ura ao montar, e com o recurso fora do plano isso seria um 403
  // na cara de quem só veio mexer no horário de atendimento.
  const temUra = (await recursosDoTenant(user.tenantId)).has("URA");

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Automações</h1>

      {/* Horário vem primeiro: é a automação que a empresa configura uma vez e
          esquece, enquanto as regras por palavra-chave são mexidas sempre. */}
      <div className="max-w-2xl mb-8">
        <BusinessHoursPanel podeEditar={user.role !== "AGENT"} />
      </div>

      {/* O menu vem antes das respostas por palavra-chave porque é ele que
          decide de quem é a conversa — as palavras-chave só respondem. */}
      {temUra && (
        <div className="max-w-2xl mb-8">
          <UraPanel podeEditar={user.role !== "AGENT"} />
        </div>
      )}

      <h2 className="text-sm font-semibold text-neutral-800 mb-3">Respostas automáticas</h2>
      <AutomationsPanel />
    </div>
  );
}
