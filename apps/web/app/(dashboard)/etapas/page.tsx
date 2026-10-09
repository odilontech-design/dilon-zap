import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { StagesPanel } from "./stages-panel";

export default async function EtapasPage({ searchParams }: { searchParams: { funil?: string } }) {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Etapas do funil</h1>
      <StagesPanel podeGerir={ehGerencia(user.role)} funilInicial={searchParams.funil ?? ""} />
    </div>
  );
}
