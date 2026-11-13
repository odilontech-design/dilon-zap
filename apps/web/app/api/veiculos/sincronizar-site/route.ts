import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { pendentesDeConfirmacao, sincronizarComSite } from "@/lib/espelho-do-site";
import { ErroImportacaoSite } from "@/lib/importar-site-estoque";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

async function gestao() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: SEM_PERMISSAO() };
  return { user };
}

/** Situação do espelho do site atual: de onde vem, quando sincronizou e quantos carros esperam confirmação. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const cfg = await prisma.veiculosConfig.findUnique({ where: { tenantId: user.tenantId }, select: { siteOrigemUrl: true, siteSincEm: true, siteSincResumo: true } });
  return NextResponse.json({ ...cfg, pendentes: await pendentesDeConfirmacao(user.tenantId) });
}

/** "Sincronizar agora": o mesmo que o agendamento faz de hora em hora. */
export async function POST() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  try {
    const r = await sincronizarComSite({ tenantId: user.tenantId, userId: user.id });
    await logAudit({ actor: user, action: "veiculos.espelho-do-site", metadata: { novos: r.novos, sumiram: r.sumiram, voltaram: r.voltaram, travado: r.travado } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroImportacaoSite) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
