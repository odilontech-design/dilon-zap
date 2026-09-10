import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";

const editarSchema = z.object({
  nome: z.string().min(1).max(40).optional(),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor inválida")
    .optional(),
  ativo: z.boolean().optional(),
  membros: z.array(z.string()).optional(),
});

/** O setor existe e é desta empresa? Sem isso, um id de outro tenant passaria. */
async function doTenant(id: string, tenantId: string) {
  return prisma.setor.findFirst({ where: { id, tenantId }, select: { id: true, nome: true } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "SETORES");
  if (bloqueio) return bloqueio;
  if (user.role === "AGENT") {
    return NextResponse.json(
      { error: "só o responsável pela conta pode mudar setores" },
      { status: 403 }
    );
  }

  const setor = await doTenant(params.id, user.tenantId);
  if (!setor) return NextResponse.json({ error: "setor não encontrado" }, { status: 404 });

  const parsed = editarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { nome, cor, ativo, membros } = parsed.data;

  if (nome && nome.trim() !== setor.nome) {
    const jaExiste = await prisma.setor.findFirst({
      where: { tenantId: user.tenantId, nome: nome.trim(), NOT: { id: setor.id } },
      select: { id: true },
    });
    if (jaExiste) {
      return NextResponse.json(
        { error: `já existe um setor chamado "${nome.trim()}"` },
        { status: 409 }
      );
    }
  }

  if (membros) {
    const unicos = [...new Set(membros)];
    if (unicos.length > 0) {
      const validos = await prisma.user.count({
        where: { id: { in: unicos }, tenantId: user.tenantId },
      });
      if (validos !== unicos.length) {
        return NextResponse.json(
          { error: "um dos membros não faz parte da sua equipe" },
          { status: 400 }
        );
      }
    }

    // Esvaziar um setor que a URA usa deixaria a opção apontando pra uma fila
    // que ninguém enxerga — o worker passaria a descartar a opção e o menu
    // encolheria sozinho, sem ninguém entender por quê. Barrar aqui é o mesmo
    // critério que a rota da URA aplica na hora de salvar o menu.
    if (unicos.length === 0) {
      const usadoNaUra = await prisma.uraOpcao.count({
        where: { tenantId: user.tenantId, setorId: setor.id },
      });
      if (usadoNaUra > 0) {
        return NextResponse.json(
          {
            error: `o setor "${setor.nome}" recebe conversas pelo menu de triagem. Tire a opção do menu antes de deixá-lo sem ninguém.`,
          },
          { status: 400 }
        );
      }
    }
  }

  // Membros trocam por substituição inteira: a tela edita a lista como um
  // bloco e reconciliar "quem entrou e quem saiu" aqui daria o mesmo
  // resultado com mais chance de erro. SetorMembro não é referenciado por
  // nada, então apagar e recriar não perde histórico de ninguém.
  await prisma.$transaction(async (tx) => {
    await tx.setor.update({
      where: { id: setor.id },
      data: {
        ...(nome ? { nome: nome.trim() } : {}),
        ...(cor ? { cor } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
    });

    if (membros) {
      const unicos = [...new Set(membros)];
      await tx.setorMembro.deleteMany({ where: { setorId: setor.id } });
      if (unicos.length > 0) {
        await tx.setorMembro.createMany({
          data: unicos.map((userId) => ({ setorId: setor.id, userId })),
        });
      }
    }
  });

  await logAudit({
    actor: user,
    action: "setor.update",
    metadata: { setorId: setor.id, nome: nome ?? setor.nome, ativo, membros: membros?.length },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "SETORES");
  if (bloqueio) return bloqueio;
  if (user.role === "AGENT") {
    return NextResponse.json(
      { error: "só o responsável pela conta pode remover setores" },
      { status: 403 }
    );
  }

  const setor = await doTenant(params.id, user.tenantId);
  if (!setor) return NextResponse.json({ error: "setor não encontrado" }, { status: 404 });

  // Setor citado no menu não pode sumir por baixo dele: a opção ficaria sem
  // destino, e o cliente que a escolhesse ouviria "encaminhando" sem ninguém
  // ser acionado. Desativar continua disponível — some dos seletores e
  // preserva o setor das conversas antigas.
  const usadoNaUra = await prisma.uraOpcao.count({
    where: { tenantId: user.tenantId, setorId: setor.id },
  });
  if (usadoNaUra > 0) {
    return NextResponse.json(
      {
        error: `o setor "${setor.nome}" está no menu de triagem. Tire a opção do menu antes de remover, ou apenas desative o setor.`,
      },
      { status: 400 }
    );
  }

  // Conversas apontando pra cá não impedem a remoção: o schema usa SetNull,
  // então o histórico continua de pé, só perde a marcação do setor. Mas se
  // for muita conversa, desativar preserva mais informação — a tela avisa.
  await prisma.setor.delete({ where: { id: setor.id } });

  await logAudit({
    actor: user,
    action: "setor.delete",
    metadata: { setorId: setor.id, nome: setor.nome },
  });

  return NextResponse.json({ ok: true });
}
