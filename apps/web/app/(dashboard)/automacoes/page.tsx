import { requireUser } from "@/lib/session";
import { AutomationsPanel } from "./automations-panel";
import { BusinessHoursPanel } from "./business-hours-panel";

export default async function AutomacoesPage() {
  const user = await requireUser();

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Automações</h1>

      {/* Horário vem primeiro: é a automação que a empresa configura uma vez e
          esquece, enquanto as regras por palavra-chave são mexidas sempre. */}
      <div className="max-w-2xl mb-8">
        <BusinessHoursPanel podeEditar={user.role !== "AGENT"} />
      </div>

      <h2 className="text-sm font-semibold text-neutral-800 mb-3">Respostas por palavra-chave</h2>
      <AutomationsPanel />
    </div>
  );
}
