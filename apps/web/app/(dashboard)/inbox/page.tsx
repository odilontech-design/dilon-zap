import { requireUser } from "@/lib/session";
import { InboxView } from "./inbox-view";
import { ehGerencia } from "@/lib/papeis";
import { prisma } from "@dilon-zap/db";

// O papel vem do servidor, não de uma consulta no cliente: é ele que decide
// se o campo de preço do pedido fica editável, e essa é uma decisão que não
// pode depender de uma requisição que ainda não voltou.
export default async function InboxPage() {
  const user = await requireUser();
  // Limite do alerta de conversa sem resposta da empresa (nulo = desligado).
  const empresa = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { alertaSemRespostaMin: true } });
  return (
    <InboxView
      ehFinanceiro={ehGerencia(user.role)}
      // Pra distinguir "passei a conversa pra outra pessoa" (que pede motivo)
      // de "puxei pra mim" (que não pede) — ver MotivoTransferencia.
      meuId={user.id}
      alertaSemRespostaMin={empresa?.alertaSemRespostaMin ?? null}
    />
  );
}
