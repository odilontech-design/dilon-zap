import { prisma, type Prisma } from "@dilon-zap/ponto-db";
import type { UsuarioAtual } from "@/lib/session";

/** Toda ação de administrador que muda dado fica registrada: quem, o quê e quando. */
export async function auditar(
  u: UsuarioAtual,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  dados?: Prisma.InputJsonValue,
) {
  await prisma.logAuditoria.create({
    data: { empresaId: u.empresaId, usuarioId: u.id, usuarioNome: u.nome, acao, entidade, entidadeId, dados },
  });
}
