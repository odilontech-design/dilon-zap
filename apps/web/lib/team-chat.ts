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
