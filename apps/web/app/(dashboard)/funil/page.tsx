import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { FunnelBoard } from "./funnel-board";

export default async function FunilPage() {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">CRM</h1>
      <FunnelBoard podeGerir={ehGerencia(user.role)} />
    </div>
  );
}
