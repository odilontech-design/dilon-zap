import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

async function negociacaoDaEmpresa(id: string, tenantId: string) {
  return prisma.negociacao.findFirst({ where: { id, tenantId }, select: { id: true } });
}

/** Tarefas da negociação: as pendentes primeiro, por data; depois as concluídas. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!(await negociacaoDaEmpresa(params.id, user.tenantId))) {
    return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });
  }

  const tarefas = await prisma.tarefaNegociacao.findMany({
    where: { negociacaoId: params.id, tenantId: user.tenantId },
    orderBy: [{ concluidaEm: { sort: "asc", nulls: "first" } }, { venceEm: "asc" }],
    include: { responsavel: { select: { id: true, name: true } } },
  });
  return NextResponse.json(tarefas);
}

const schema = z.object({
  tipo: z.enum(["LIGACAO", "WHATSAPP", "REUNIAO", "EMAIL", "TAREFA"]).default("TAREFA"),
  titulo: z.string().trim().min(1).max(160),
  venceEm: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "data inválida"),
  responsavelId: z.string().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!(await negociacaoDaEmpresa(params.id, user.tenantId))) {
    return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });
  }

  // Sem responsável informado, a tarefa é de quem a criou: tarefa de ninguém
  // é a que não é feita.
  const responsavelId = parsed.data.responsavelId === undefined ? user.id : parsed.data.responsavelId;
  if (responsavelId) {
    const resp = await prisma.user.findFirst({ where: { id: responsavelId, tenantId: user.tenantId }, select: { id: true } });
    if (!resp) return NextResponse.json({ error: "responsável inválido" }, { status: 400 });
  }

  const tarefa = await prisma.tarefaNegociacao.create({
    data: {
      tenantId: user.tenantId,
      negociacaoId: params.id,
      tipo: parsed.data.tipo,
      titulo: parsed.data.titulo,
      venceEm: new Date(parsed.data.venceEm),
      responsavelId,
    },
  });
  return NextResponse.json(tarefa);
}
