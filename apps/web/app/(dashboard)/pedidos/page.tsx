import { requireUser } from "@/lib/session";
import { OrdersQueue } from "./orders-queue";

// A fila é do Responsável e do Financeiro. A consultora vê os pedidos dela
// dentro da conversa, que é onde ela trabalha — a fila mostraria o que as
// outras mandaram fechar, o que pra ela é ruído.
export default async function PedidosPage() {
  const user = await requireUser();
  const ehFinanceiro = user.role === "OWNER" || user.role === "FINANCEIRO";
  if (!ehFinanceiro) {
    return (
      <div className="p-6 text-sm text-neutral-600">
        Os pedidos que você abriu aparecem dentro de cada conversa, no Inbox.
      </div>
    );
  }
  return <OrdersQueue ehFinanceiro={ehFinanceiro} />;
}
