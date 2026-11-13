import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { anunciarNaWebmotors } from "@/lib/portais-webmotors";

const corpo = z.union([z.object({ todos: z.literal(true) }), z.object({ veiculoIds: z.array(z.string()).min(1).max(500) })]);

/** "Anunciar todos os disponíveis" (ou uma lista) na Webmotors. Carro sem km fica esperando a km. */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão anuncia nos portais" }, { status: 403 });
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const ids =
    "todos" in parsed.data
      ? (await prisma.veiculo.findMany({ where: { tenantId: user.tenantId, status: "DISPONIVEL", publicacoes: { none: { portal: "WEBMOTORS", ativo: true } } }, select: { id: true }, take: 500 })).map((v) => v.id)
      : parsed.data.veiculoIds;
  return NextResponse.json(await anunciarNaWebmotors(user.tenantId, ids));
}
