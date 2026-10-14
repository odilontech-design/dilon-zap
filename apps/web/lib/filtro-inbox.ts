import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

/**
 * O filtro do Inbox (busca, etiqueta, atendente, setor, só não lidas) num
 * lugar só — a lista de conversas e os números das abas usam este mesmo
 * filtro. Antes cada um montava o seu, e o número da aba contava a empresa
 * toda enquanto a lista mostrava só a atendente escolhida: não batia
 * (pedido da Dilon Tech, 13/10).
 *
 * Não inclui o status: a lista filtra pela aba aberta, e as abas contam as
 * três de uma vez.
 */
export async function filtroDoInbox(user: CurrentUser, params: URLSearchParams): Promise<Prisma.ConversationWhereInput> {
  const search = params.get("search")?.trim();
  const tag = params.get("tag")?.trim();
  const assignedToId = params.get("assignedToId")?.trim();
  const setorId = params.get("setorId")?.trim();
  const unreadOnly = params.get("unreadOnly") === "1";
  const searchDigits = search?.replace(/\D/g, "");

  return {
    tenantId: user.tenantId,
    // Grupo tem tela própria e fica fora do Inbox — ver Contact.grupo.
    contact: { grupo: false },
    ...(tag ? { tags: { has: tag } } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(setorId ? (setorId === "sem" ? { setorId: null } : { setorId }) : {}),
    ...(unreadOnly ? { messages: { some: { direction: "INBOUND", readAt: null } } } : {}),
    AND: [
      await conversationVisibilityWhere(user, { listagem: true }),
      ...(search
        ? [
            {
              OR: [
                { contact: { name: { contains: search, mode: "insensitive" as const } } },
                ...(searchDigits ? [{ contact: { waJid: { contains: searchDigits } } }] : []),
                ...(searchDigits ? [{ contact: { phoneNumber: { contains: searchDigits } } }] : []),
                { messages: { some: { body: { contains: search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
    ],
  };
}
