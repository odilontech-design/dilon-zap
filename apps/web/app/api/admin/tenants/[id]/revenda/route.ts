import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { usoDoMes } from "@dilon-zap/vendedor-ia";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { recursosDoTenant } from "@/lib/plano";
import { STATUS_NO_PATIO } from "@/lib/veiculos-regras";

/** Plano da revenda de veículos e pacote do Vendedor IA de uma empresa (Super Admin). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const [cfg, ia, noPatio, recursos, uso] = await Promise.all([
    prisma.veiculosConfig.findUnique({ where: { tenantId: params.id }, select: { plano: true } }),
    prisma.vendedorIaConfig.findUnique({ where: { tenantId: params.id }, select: { leadsContratados: true, ativo: true } }),
    prisma.veiculo.count({ where: { tenantId: params.id, status: { in: STATUS_NO_PATIO } } }),
    recursosDoTenant(params.id),
    usoDoMes(params.id, new Date()),
  ]);
  return NextResponse.json({
    plano: cfg?.plano ?? null,
    leadsContratados: ia?.leadsContratados ?? null,
    iaLigada: ia?.ativo ?? false,
    noPatio,
    temVeiculos: recursos.has("VEICULOS"),
    temVendedorIa: recursos.has("VENDEDOR_IA"),
    leadsNoMes: uso.leads,
    custoIaMesMicrosUsd: uso.custoMicrosUsd,
  });
}

const corpo = z.object({
  plano: z.enum(["GARAGEM", "REVENDA", "REVENDA_MAIS"]).nullable(),
  leadsContratados: z.number().int().min(1).max(100_000).nullable(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = corpo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.veiculosConfig.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, plano: d.plano }, update: { plano: d.plano } });
    const ia = await tx.vendedorIaConfig.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, leadsContratados: d.leadsContratados, ...(d.leadsContratados ? { limiteLeadsMes: d.leadsContratados } : {}) },
      update: { leadsContratados: d.leadsContratados },
      select: { limiteLeadsMes: true },
    });
    // O limite que a loja escolheu não pode ficar acima do novo contratado.
    if (d.leadsContratados !== null && ia.limiteLeadsMes > d.leadsContratados) {
      await tx.vendedorIaConfig.update({ where: { tenantId: tenant.id }, data: { limiteLeadsMes: d.leadsContratados } });
    }
  });
  await logAudit({ actor: admin, action: "revenda.plano", targetTenantId: tenant.id, targetTenantName: tenant.name, metadata: d });
  return NextResponse.json({ ok: true });
}
