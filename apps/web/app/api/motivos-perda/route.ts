import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { garantirMotivosDePerda } from "@/lib/funis";

export async function GET() {
  const user = await requireUser();
  await garantirMotivosDePerda(user.tenantId);
  const motivos = await prisma.motivoDePerda.findMany({
    where: { tenantId: user.tenantId, ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return NextResponse.json(motivos);
}

const schema = z.object({ nome: z.string().trim().min(1).max(60) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão altera a lista" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  const existente = await prisma.motivoDePerda.findUnique({
    where: { tenantId_nome: { tenantId: user.tenantId, nome: parsed.data.nome } },
  });
  // Um motivo desativado que volta a ser criado é reativado, em vez de falhar
  // por nome repetido.
  if (existente) {
    if (existente.ativo) return NextResponse.json({ error: "esse motivo já existe" }, { status: 409 });
    await prisma.motivoDePerda.update({ where: { id: existente.id }, data: { ativo: true } });
    return NextResponse.json({ id: existente.id, nome: existente.nome });
  }

  const criado = await prisma.motivoDePerda.create({ data: { tenantId: user.tenantId, nome: parsed.data.nome } });
  return NextResponse.json({ id: criado.id, nome: criado.nome });
}
