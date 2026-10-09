import { requireUser } from "@/lib/session";
import { TarefasPanel } from "./tarefas-panel";

export default async function TarefasPage() {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Tarefas</h1>
      <TarefasPanel meuId={user.id} />
    </div>
  );
}
