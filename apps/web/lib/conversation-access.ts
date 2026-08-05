import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";

// AGENT só vê conversa sem atribuição ou atribuída a si mesmo — evita, por
// exemplo, um comercial encontrar/abordar alguém que já está em atendimento
// com o financeiro. OWNER e SUPERADMIN continuam vendo tudo do tenant.
export function conversationVisibilityWhere(user: CurrentUser): Prisma.ConversationWhereInput {
  if (user.role !== "AGENT") return {};
  return { OR: [{ assignedToId: null }, { assignedToId: user.id }] };
}
