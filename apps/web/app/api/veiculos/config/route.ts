import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { configRevendaSchema } from "@/lib/veiculos-schemas";
import { configDaRevenda, linkDaLoja, normalizarWhatsapp } from "@/lib/vitrine";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/** Configuração da vitrine pública. Ler e mudar é da gestão. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const [cfg, tenant, numero] = await Promise.all([
    configDaRevenda(user.tenantId),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { slug: true, name: true } }),
    numeroGeral(user.tenantId),
  ]);
  return NextResponse.json({ ...cfg, link: linkDaLoja(tenant.slug), nomeEmpresa: tenant.name, numeroConectado: numero?.phoneNumber ?? null });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = configRevendaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const whatsapp = normalizarWhatsapp(d.whatsapp);
  if (d.whatsapp && (!whatsapp || whatsapp.length < 12)) return NextResponse.json({ error: "WhatsApp inválido: use DDD + número" }, { status: 400 });

  const dados = {
    vitrineAtiva: d.vitrineAtiva,
    whatsapp,
    nomeLoja: d.nomeLoja || null,
    endereco: d.endereco || null,
    sobre: d.sobre || null,
    mostrarReservados: d.mostrarReservados,
  };
  await prisma.veiculosConfig.upsert({ where: { tenantId: user.tenantId }, create: { tenantId: user.tenantId, ...dados }, update: dados });
  await logAudit({ actor: user, action: "veiculos.config", metadata: { vitrineAtiva: d.vitrineAtiva } });
  return NextResponse.json({ ok: true });
}
