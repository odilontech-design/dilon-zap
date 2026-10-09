import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";

const schema = z.object({
  nome: z.string().trim().min(1).max(60).optional(),
  /** Torna este o funil que abre primeiro. */
  padrao: z.literal(true).optional(),
  /** Toda negociação nova ganha a tarefa de ligar para o dia seguinte. */
  tarefaLigarAuto: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera funis" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  const funil = await prisma.funil.findFirst({ where: { id: params.id, tenantId: user.tenantId, arquivadoEm: null } });
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });

  if (parsed.data.nome && parsed.data.nome !== funil.nome) {
    const clash = await prisma.funil.findUnique({
      where: { tenantId_nome: { tenantId: user.tenantId, nome: parsed.data.nome } },
    });
    if (clash) return NextResponse.json({ error: "já existe um funil com esse nome" }, { status: 409 });
  }

  await prisma.$transaction([
    ...(parsed.data.padrao
      ? [prisma.funil.updateMany({ where: { tenantId: user.tenantId, padrao: true }, data: { padrao: false } })]
      : []),
    prisma.funil.update({
      where: { id: funil.id },
      data: {
        nome: parsed.data.nome,
        ...(parsed.data.padrao ? { padrao: true } : {}),
        ...(parsed.data.tarefaLigarAuto !== undefined ? { tarefaLigarAuto: parsed.data.tarefaLigarAuto } : {}),
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

/**
 * "Apagar" um funil é arquivá-lo. Negociações ganhas e perdidas dele alimentam
 * o histórico de vendas; apagar levaria isso junto. Só se arquiva um funil sem
 * negociação aberta, e nunca o padrão.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera funis" }, { status: 403 });

  const funil = await prisma.funil.findFirst({ where: { id: params.id, tenantId: user.tenantId, arquivadoEm: null } });
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });
  if (funil.padrao) {
    return NextResponse.json({ error: "este é o funil padrão. Torne outro padrão antes de arquivá-lo." }, { status: 409 });
  }

  const abertas = await prisma.negociacao.count({ where: { funilId: funil.id, status: "ABERTA" } });
  if (abertas > 0) {
    return NextResponse.json(
      { error: `Este funil tem ${abertas} negociação(ões) aberta(s). Mova ou encerre antes de arquivar.` },
      { status: 409 }
    );
  }

  await prisma.funil.update({ where: { id: funil.id }, data: { arquivadoEm: new Date() } });
  return NextResponse.json({ ok: true });
}
