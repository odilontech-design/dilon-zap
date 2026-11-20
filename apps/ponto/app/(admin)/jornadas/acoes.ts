"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@dilon-zap/ponto-db";
import { acaoDeAdmin, ErroDeAcao, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";
import { semanaSchema, validarSemana, type Semana } from "@/lib/jornada";
import { cabeMais, PLANOS } from "@/lib/planos";

const schema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(2, "Dê um nome à jornada").max(80),
  semana: semanaSchema,
});

export async function salvarJornada(entrada: z.input<typeof schema>): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = schema.parse(entrada);
    const semana = p.semana as Semana;
    const problema = validarSemana(semana);
    if (problema) throw new ErroDeAcao(problema);

    if (p.id) {
      const atual = await prisma.jornada.findFirst({ where: { id: p.id, empresaId: u.empresaId } });
      if (!atual) throw new ErroDeAcao("Jornada não encontrada.");
      await prisma.jornada.update({ where: { id: p.id }, data: { nome: p.nome, semana } });
      await auditar(u, "editar_jornada", "Jornada", p.id, { nome: p.nome, semana });
    } else {
      // Limite do plano conferido aqui, no servidor (o Essencial tem 2 turnos).
      const limite = PLANOS[u.empresa.plano].maxJornadas;
      const emUso = await prisma.jornada.count({ where: { empresaId: u.empresaId, ativa: true } });
      if (!cabeMais(limite, emUso)) {
        throw new ErroDeAcao(`O plano ${PLANOS[u.empresa.plano].nome} permite ${limite} jornadas. Edite uma existente ou mude de plano.`);
      }
      const j = await prisma.jornada.create({ data: { empresaId: u.empresaId, nome: p.nome, semana } });
      await auditar(u, "criar_jornada", "Jornada", j.id, { nome: p.nome, semana });
    }
    revalidatePath("/jornadas");
  });
}

export async function excluirJornada(id: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const j = await prisma.jornada.findFirst({ where: { id, empresaId: u.empresaId }, include: { _count: { select: { colaboradores: true } } } });
    if (!j) throw new ErroDeAcao("Jornada não encontrada.");
    if (j._count.colaboradores > 0) throw new ErroDeAcao("Há colaboradores nesta jornada. Mude a jornada deles antes de excluir.");
    await prisma.jornada.delete({ where: { id } });
    await auditar(u, "excluir_jornada", "Jornada", id, { nome: j.nome });
    revalidatePath("/jornadas");
  });
}
