import { requireUser } from "@/lib/session";
import { SetoresPanel } from "./setores-panel";

export default async function SetoresPage() {
  const user = await requireUser();

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Setores</h1>
      <SetoresPanel podeEditar={user.role !== "AGENT"} />
    </div>
  );
}
