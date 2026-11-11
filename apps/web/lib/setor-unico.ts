import { prisma } from "@dilon-zap/db";

/**
 * O único membro ATIVO de um setor, ou null se o setor tiver zero ou mais de
 * um.
 *
 * Setor com uma pessoa só não tem fila para repartir: encaminhar para ele e
 * deixar a conversa "na fila, sem dono" só serve para ninguém ser avisado. Foi
 * o caso #17714 da Guttierres (10/11): o Fiscal encaminhou para Sócio Diretor
 * (só o Carlos), a conversa ficou sem responsável e o cliente escreveu cinco
 * vezes sem resposta. A URA já atribuía nesse caso (ver direcionarParaSetor no
 * worker); a transferência manual passa a fazer o mesmo.
 */
export async function membroUnicoDoSetor(setorId: string): Promise<{ id: string; name: string } | null> {
  const membros = await prisma.setorMembro.findMany({
    where: { setorId, user: { deactivatedAt: null } },
    select: { user: { select: { id: true, name: true } } },
    take: 2,
  });
  return membros.length === 1 ? membros[0].user : null;
}
