import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type Papel, type Plano } from "@dilon-zap/ponto-db";
import { authOptions } from "@/lib/auth";
import { temRecurso, type Recurso } from "@/lib/planos";

export type UsuarioAtual = {
  id: string;
  nome: string;
  papel: Papel;
  trocarSenha: boolean;
  empresaId: string;
  colaboradorId: string | null;
  empresa: { razaoSocial: string; nomeFantasia: string | null; cnpj: string; plano: Plano; timezone: string };
};

/**
 * Lê o usuário do BANCO a cada requisição, não do token.
 *
 * O token só carrega o id. Papel, plano, empresa e "desativado" mudam por
 * fora da sessão (o administrador desliga o colaborador, o plano muda), e um
 * token de 30 dias com o valor velho deixaria o desligado batendo ponto. Com
 * 10 colaboradores por empresa, a consulta extra não pesa.
 */
export async function usuarioAtual(): Promise<UsuarioAtual | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;

  const u = await prisma.usuario.findUnique({
    where: { id },
    include: {
      empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true, plano: true, timezone: true, ativa: true } },
      colaborador: { select: { ativo: true } },
    },
  });
  if (!u || u.desativadoEm || !u.empresa.ativa || (u.colaborador && !u.colaborador.ativo)) return null;

  return {
    id: u.id,
    nome: u.nome,
    papel: u.papel,
    trocarSenha: u.trocarSenha,
    empresaId: u.empresaId,
    colaboradorId: u.colaboradorId,
    empresa: u.empresa,
  };
}

export async function requireUsuario(): Promise<UsuarioAtual> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (u.trocarSenha) redirect("/trocar-senha");
  return u;
}

export async function requireAdmin(): Promise<UsuarioAtual> {
  const u = await requireUsuario();
  if (u.papel !== "ADMIN") redirect("/bater");
  return u;
}

export async function requireColaborador(): Promise<UsuarioAtual & { colaboradorId: string }> {
  const u = await requireUsuario();
  if (!u.colaboradorId) redirect("/painel");
  return u as UsuarioAtual & { colaboradorId: string };
}

export function exigirRecurso(u: UsuarioAtual, recurso: Recurso) {
  if (!temRecurso(u.empresa.plano, recurso)) redirect(`/configuracoes?recurso=${recurso}`);
}
