import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { laboratorioSchema } from "@/lib/otica-schemas";

/** Laboratórios da ótica, ativos primeiro. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const labs = await prisma.laboratorio.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, telefone: true, contato: true, prazoDias: true, ativo: true },
  });
  return NextResponse.json(labs);
}

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cadastra laboratório" }, { status: 403 });

  const parsed = laboratorioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existe = await prisma.laboratorio.findFirst({
    where: { tenantId: user.tenantId, nome: { equals: parsed.data.nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (existe) return NextResponse.json({ error: "já existe um laboratório com esse nome" }, { status: 409 });

  const lab = await prisma.laboratorio.create({
    data: {
      tenantId: user.tenantId,
      nome: parsed.data.nome,
      telefone: parsed.data.telefone || null,
      contato: parsed.data.contato || null,
      prazoDias: parsed.data.prazoDias ?? null,
    },
  });
  return NextResponse.json(lab, { status: 201 });
}
