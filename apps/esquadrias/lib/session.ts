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

export async function requireUsuario(): Promise<UsuarioAtual> {
  const session = await getServerSession(authOptions);
  const usuario = session?.user as UsuarioAtual | undefined;
  if (!usuario) redirect("/login");
  return usuario;
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
