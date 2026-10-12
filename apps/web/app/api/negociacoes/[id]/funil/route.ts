import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { duplicarEmOutroFunil, ErroDeNegocio, moverParaOutroFunil } from "@/lib/negociacoes";

const schema = z.object({
  modo: z.enum(["mover", "duplicar"]),
  funilId: z.string().min(1),
  stageId: z.string().min(1),
});

/**
 * POST /api/negociacoes/[id]/funil — envia a negociação para outro funil
 * (`mover`) ou cria uma cópia nele (`duplicar`). Devolve o id da negociação
 * que a tela deve mostrar em seguida.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "escolha o funil e a etapa" }, { status: 400 });
  const d = parsed.data;

  const n = await prisma.negociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  try {
    if (d.modo === "mover") {
      await moverParaOutroFunil(n, { funilId: d.funilId, stageId: d.stageId }, user);
      return NextResponse.json({ id: n.id });
    }
    const copia = await duplicarEmOutroFunil(n.id, user.tenantId, { funilId: d.funilId, stageId: d.stageId }, user);
    return NextResponse.json({ id: copia.id });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
