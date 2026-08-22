import { PainelClientes } from "./painel-clientes";
import { requireUsuario } from "@/lib/session";

export default async function ClientesPage() {
  await requireUsuario();
  return <PainelClientes />;
}
