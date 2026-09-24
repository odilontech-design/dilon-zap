import { requireUser } from "@/lib/session";
import { TeamChatPanel } from "./team-chat-panel";

// Sem checagem de papel nem de recurso de plano: chat interno é da equipe
// inteira, em qualquer plano — não é um recurso de atendimento ao cliente
// como Setores ou Pedidos, então não faz sentido travar por assinatura.
export default async function ChatEquipePage() {
  const user = await requireUser();
  return <TeamChatPanel meuId={user.id} />;
}
