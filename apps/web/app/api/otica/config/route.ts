import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { configDaOtica } from "@/lib/otica";
import { AVISOS_PADRAO, ETAPAS_COM_AVISO, avisoDaEtapa } from "@/lib/otica-regras";
import { configSchema } from "@/lib/otica-schemas";

/** Configuração da ótica com os avisos já resolvidos (o da loja ou o de fábrica). */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const cfg = await configDaOtica(user.tenantId);
  return NextResponse.json({
    proximoNumeroOS: cfg.proximoNumeroOS,
    validadeReceitaMeses: cfg.validadeReceitaMeses,
    avisos: Object.fromEntries(
      ETAPAS_COM_AVISO.map((e) => [e, { ...avisoDaEtapa(e, cfg.avisos), padrao: AVISOS_PADRAO[e]!.texto }])
    ),
  });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão muda as configurações" }, { status: 403 });

  const parsed = configSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // A numeração só anda para a frente do que já existe: voltar para um
  // número usado criaria duas OS com o mesmo número no papel.
  if (d.proximoNumeroOS !== undefined) {
    const maior = await prisma.ordemServico.aggregate({ where: { tenantId: user.tenantId }, _max: { numero: true } });
    const minimo = (maior._max.numero ?? 0) + 1;
    if (d.proximoNumeroOS < minimo) {
      return NextResponse.json({ error: `o próximo número precisa ser ${minimo} ou maior (já existe a OS ${minimo - 1})` }, { status: 400 });
    }
  }

  const atual = await configDaOtica(user.tenantId);
  const avisos = d.avisos ? { ...((atual.avisos as Record<string, unknown> | null) ?? {}), ...d.avisos } : undefined;

  await prisma.oticaConfig.update({
    where: { tenantId: user.tenantId },
    data: { proximoNumeroOS: d.proximoNumeroOS, validadeReceitaMeses: d.validadeReceitaMeses, avisos },
  });
  return NextResponse.json({ ok: true });
}
