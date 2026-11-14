import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { configDaOtica } from "@/lib/otica";
import { AVISOS_PADRAO, ETAPAS_COM_AVISO, avisoDaEtapa, numeroOS } from "@/lib/otica-regras";
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
      // Diz QUAL é a OS que segura o número: a cancelada some do quadro mas continua ocupando o número, e a
      // mensagem antiga ("já existe a OS 502") parecia erro para quem não via nenhuma OS na tela (Visuallis, 13/11).
      const seguradora = await prisma.ordemServico.findFirst({
        where: { tenantId: user.tenantId, numero: minimo - 1 },
        select: { etapa: true, historica: true, createdAt: true, contact: { select: { name: true } } },
      });
      const quem = [
        seguradora?.etapa === "CANCELADA" ? "cancelada" : seguradora?.historica ? "OS antiga do papel" : null,
        seguradora?.contact?.name ? `de ${seguradora.contact.name}` : null,
        seguradora ? `criada em ${seguradora.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : null,
      ].filter(Boolean).join(", ");
      const dica = seguradora?.etapa === "CANCELADA" ? " Uma OS cancelada continua ocupando o número dela." : "";
      return NextResponse.json(
        { error: `o próximo número precisa ser ${numeroOS(minimo)} ou maior: já existe a OS ${numeroOS(minimo - 1)}${quem ? ` (${quem})` : ""}.${dica}` },
        { status: 400 }
      );
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
