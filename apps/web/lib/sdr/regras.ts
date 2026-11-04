/**
 * Quem faz o que no SDR. Puro, para ter teste.
 *
 * Atendente fica de fora: prospecção é decisão comercial da gestão. O Financeiro
 * acompanha sem editar. SUPERADMIN entra como responsável da PRÓPRIA empresa, e
 * o tenant continua vindo da sessão (ver lib/papeis).
 */

export type NivelSdr = "ler" | "escrever";

export function podeSdr(role: string | null | undefined, nivel: NivelSdr): boolean {
  if (role === "OWNER" || role === "SUPERADMIN") return true;
  return role === "FINANCEIRO" && nivel === "ler";
}
