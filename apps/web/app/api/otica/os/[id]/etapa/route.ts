import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { moverEtapa } from "@/lib/otica";
import { podeMover } from "@/lib/otica-regras";
import { etapaSchema } from "@/lib/otica-schemas";
import { ErroDeConta } from "@/lib/contas-receber";

/**
 * Muda a OS de etapa e, se a etapa tiver aviso ligado, manda a mensagem ao
 * cliente. A resposta diz o que aconteceu com o aviso, para a tela mostrar
 * "cliente avisado" ou o motivo de não ter avisado.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = etapaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { para, avisar, motivoCancelamento, devolverSinal } = parsed.data;

  const ordem = await prisma.ordemServico.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, etapa: true, historica: true },
  });
  if (!ordem) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
  if (ordem.historica) return NextResponse.json({ error: "OS antiga do papel é só registro: não muda de etapa" }, { status: 409 });
  if (!podeMover(ordem.etapa, para)) {
    return NextResponse.json(
      { error: ordem.etapa === "CANCELADA" ? "OS cancelada não volta: abra uma nova" : "a OS já está nessa etapa" },
      { status: 409 }
    );
  }

  try {
    const { aviso } = await moverEtapa({
      tenantId: user.tenantId,
      ordemId: ordem.id,
      para,
      porId: user.id,
      avisar,
      motivoCancelamento,
      devolverSinal,
    });
    return NextResponse.json({ ok: true, aviso });
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
