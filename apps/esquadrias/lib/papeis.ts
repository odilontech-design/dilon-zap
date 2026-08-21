import type { PapelUsuario } from "@dilon-zap/erp-db";

/**
 * Regras de papel puras — sem nada de servidor dentro.
 *
 * Ficam separadas do lib/session porque as MESMAS regras decidem o que a tela
 * mostra (componente cliente) e o que a API aceita (servidor). Se morassem
 * junto do `getServerSession`, importar a regra no cliente arrastaria o
 * NextAuth inteiro pro bundle do navegador.
 *
 * Isso não transforma a checagem do cliente em segurança: ela é usabilidade.
 * Quem manda é a checagem do servidor, no lib/api.
 */

/**
 * Papéis que enxergam custo e margem. PRODUCAO fica de fora de propósito: o
 * cortador precisa da medida e do perfil, não do quanto a empresa ganha na
 * janela — e essa é a informação que mais vaza quando alguém sai da empresa.
 */
export function vePreco(papel: PapelUsuario): boolean {
  return papel !== "PRODUCAO";
}

export function podeEditarCatalogo(papel: PapelUsuario): boolean {
  return papel === "OWNER" || papel === "GERENTE";
}

export function podeVerFinanceiro(papel: PapelUsuario): boolean {
  return papel === "OWNER" || papel === "GERENTE" || papel === "FINANCEIRO";
}
