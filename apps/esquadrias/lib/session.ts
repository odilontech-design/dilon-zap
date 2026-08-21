import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { PapelUsuario, PlanoAssinatura } from "@dilon-zap/erp-db";
import { authOptions } from "@/lib/auth";
import { temRecurso, type Recurso } from "@/lib/planos";

// Reexportadas por conveniência: as regras puras vivem no lib/papeis pra não
// arrastar o NextAuth pro bundle do navegador quando uma tela usa a regra.
export { vePreco, podeEditarCatalogo, podeVerFinanceiro } from "@/lib/papeis";

export type UsuarioAtual = {
  id: string;
  name: string;
  email: string;
  papel: PapelUsuario;
  empresaId: string;
  empresaNome: string;
  plano: PlanoAssinatura;
};

/**
 * Confere que a sessão traz os campos que TODA consulta usa pra isolar tenant.
 *
 * Sem isso, uma sessão sem `empresaId` (token emitido por outro produto do
 * monorepo com o mesmo segredo, token de uma versão antiga do app) chegaria
 * às queries como `where: { empresaId: undefined }` — e o Prisma trata campo
 * `undefined` como filtro AUSENTE, devolvendo os dados de todas as empresas.
 * O buraco não daria erro nenhum: a tela abriria normal, com dado de mais.
 */
export function sessaoCompleta(usuario: unknown): usuario is UsuarioAtual {
  const u = usuario as Partial<UsuarioAtual> | undefined;
  return Boolean(u && typeof u.empresaId === "string" && u.empresaId && typeof u.papel === "string" && u.papel);
}

export async function requireUsuario(): Promise<UsuarioAtual> {
  const session = await getServerSession(authOptions);
  if (!sessaoCompleta(session?.user)) redirect("/login");
  return session!.user as UsuarioAtual;
}

export async function requireDono(): Promise<UsuarioAtual> {
  const usuario = await requireUsuario();
  if (usuario.papel !== "OWNER" && usuario.papel !== "GERENTE") redirect("/painel");
  return usuario;
}

/**
 * Trava de plano no SERVIDOR. Esconder o item do menu não é controle de
 * acesso: quem digitar /plano-corte na barra de endereço entra. A checagem
 * real mora aqui e nas rotas de API.
 */
export async function requireRecurso(recurso: Recurso): Promise<UsuarioAtual> {
  const usuario = await requireUsuario();
  if (!temRecurso(usuario.plano, recurso)) redirect(`/upgrade?recurso=${recurso}`);
  return usuario;
}
