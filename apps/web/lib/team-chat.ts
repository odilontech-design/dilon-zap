/**
 * Chat interno da equipe. Um canal É um Setor — não existe cadastro de canal
 * separado. `setorId` nulo é o canal Geral (todo mundo da empresa); setorId
 * preenchido é a conversa daquele setor, visível a quem é membro dele.
 *
 * Puro, pra ter teste — errar aqui vaza conversa interna de um setor pra
 * quem não devia ver.
 */

export type PapelUsuario = "OWNER" | "AGENT" | "FINANCEIRO" | "SUPERADMIN";

/**
 * O Responsável (e o superadmin da Dilon Tech) vê e escreve em qualquer
 * canal, igual já enxergam qualquer conversa de cliente — é quem administra
 * a conta. Os demais só o Geral e os setores de que fazem parte.
 */
export function podeVerCanal(
  role: PapelUsuario,
  meusSetorIds: string[],
  canalSetorId: string | null
): boolean {
  if (canalSetorId === null) return true; // Geral é de todo mundo, sempre
  if (role === "OWNER" || role === "SUPERADMIN") return true;
  return meusSetorIds.includes(canalSetorId);
}

/**
 * Conversa direta 1 a 1: só quem escreveu e quem recebeu enxerga. Sem exceção
 * de papel — nem o Responsável lê a conversa privada de dois colegas, ao
 * contrário dos canais de setor, que ele acompanha.
 */
export function podeVerConversaDireta(meuId: string, autorId: string, destinatarioId: string): boolean {
  return meuId === autorId || meuId === destinatarioId;
}

/**
 * Onde a mensagem mora, a partir dos dois campos do banco. Geral não tem
 * setor nem destinatário; direta tem destinatário (e nunca setor).
 */
export function tipoDeConversa(setorId: string | null, destinatarioId: string | null): "GERAL" | "SETOR" | "DIRETA" {
  if (destinatarioId) return "DIRETA";
  return setorId ? "SETOR" : "GERAL";
}
