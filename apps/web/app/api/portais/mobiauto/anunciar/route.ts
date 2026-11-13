import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { gestaoDosPortais } from "@/lib/portais-api";
import { anunciarNaMobiauto } from "@/lib/portais-mobiauto";

const corpo = z.union([z.object({ todos: z.literal(true) }), z.object({ veiculoIds: z.array(z.string()).min(1).max(500) })]);

/** "Anunciar todos os disponíveis" (ou uma lista) na MobiAuto. Carro sem km fica esperando a km. */
export async function POST(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const ids =
    "todos" in parsed.data
      ? (await prisma.veiculo.findMany({ where: { tenantId: user.tenantId, status: "DISPONIVEL", publicacoes: { none: { portal: "MOBIAUTO", ativo: true } } }, select: { id: true }, take: 500 })).map((v) => v.id)
      : parsed.data.veiculoIds;
  return NextResponse.json(await anunciarNaMobiauto(user.tenantId, ids));
}
