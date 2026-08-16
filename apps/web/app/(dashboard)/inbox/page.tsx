import { requireUser } from "@/lib/session";
import { InboxView } from "./inbox-view";

// O papel vem do servidor, não de uma consulta no cliente: é ele que decide
// se o campo de preço do pedido fica editável, e essa é uma decisão que não
// pode depender de uma requisição que ainda não voltou.
export default async function InboxPage() {
  const user = await requireUser();
  return <InboxView ehFinanceiro={user.role === "OWNER" || user.role === "FINANCEIRO"} />;
}
