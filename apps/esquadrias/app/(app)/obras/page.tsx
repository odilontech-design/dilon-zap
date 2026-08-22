import { requireUsuario } from "@/lib/session";
import { PainelObras } from "./painel-obras";

export default async function ObrasPage() {
  await requireUsuario();
  return <PainelObras />;
}
