import { prisma } from "@dilon-zap/erp-db";
import type { UsuarioAtual } from "@/lib/session";

/**
 * Registra uma ação na trilha de auditoria.
 *
 * Nunca deixa a operação principal falhar: se a auditoria cair, o orçamento
 * ainda tem que salvar. Perder a linha do log é ruim; perder a venda do
 * vendedor porque o log falhou é pior.
 */
export async function registrar(
  usuario: Pick<UsuarioAtual, "id" | "name" | "empresaId">,
  acao: string,
  alvo?: { entidade?: string; entidadeId?: string; detalhe?: unknown },
): Promise<void> {
  try {
    await prisma.registroAuditoria.create({
      data: {
        empresaId: usuario.empresaId,
        atorId: usuario.id,
        atorNome: usuario.name,
        acao,
        entidade: alvo?.entidade ?? null,
        entidadeId: alvo?.entidadeId ?? null,
        detalhe: (alvo?.detalhe ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("[auditoria] falhou ao registrar", acao, err);
  }
}
