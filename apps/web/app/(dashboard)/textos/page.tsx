import { requireUser } from "@/lib/session";
import { TextsPanel } from "./texts-panel";

// Atendente entra e consulta; só o Responsável cria e edita. Texto padrão da
// empresa é decisão da empresa — se cada uma editar o seu, o padrão some.
export default async function TextosPage() {
  const user = await requireUser();
  return <TextsPanel podeEditar={user.role === "OWNER"} />;
}
