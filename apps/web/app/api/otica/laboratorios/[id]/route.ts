import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { laboratorioSchema } from "@/lib/otica-schemas";

/** Edita ou arquiva um laboratório. Não apaga: OS antigas continuam apontando para ele. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão edita laboratório" }, { status: 403 });

  const parsed = laboratorioSchema.partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const lab = await prisma.laboratorio.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!lab) return NextResponse.json({ error: "laboratório não encontrado" }, { status: 404 });

  if (d.nome) {
    const outro = await prisma.laboratorio.findFirst({
      where: { tenantId: user.tenantId, nome: { equals: d.nome, mode: "insensitive" }, id: { not: lab.id } },
      select: { id: true },
    });
    if (outro) return NextResponse.json({ error: "já existe um laboratório com esse nome" }, { status: 409 });
  }

  const atualizado = await prisma.laboratorio.update({
    where: { id: lab.id },
    data: {
      nome: d.nome,
      telefone: d.telefone === undefined ? undefined : d.telefone || null,
      contato: d.contato === undefined ? undefined : d.contato || null,
      prazoDias: d.prazoDias === undefined ? undefined : d.prazoDias,
      ativo: d.ativo,
    },
  });
  return NextResponse.json(atualizado);
}
