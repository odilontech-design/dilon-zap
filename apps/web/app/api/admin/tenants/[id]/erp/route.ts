import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ERP_PLANOS, novoTotalDaAssinatura, PLANOS_ERP, type ErpPlano } from "@/lib/erp-regras";
import { atualizarEscritorio, consultarEscritorio, criarEscritorio, erpConfigurado, ErpIndisponivelError, redefinirSenha } from "@/lib/erp-contabilidade";
import { guardarUso, sincronizarErp } from "@/lib/erp-sync";

/**
 * ERP Dilon Contabilidade como produto de uma empresa do Zap.
 *
 * Regra de ouro: o estado local só muda depois que o ERP confirmou. Se o ERP
 * estiver fora do ar, a ação falha com a mensagem e nada fica pela metade.
 */

const limite = z.number().int().min(1).max(100000).nullable();
const plano = z.enum(PLANOS_ERP as [ErpPlano, ...ErpPlano[]]);

const ativarSchema = z.object({
  acao: z.literal("ativar"),
  plano,
  mensalCents: z.number().int().min(0).max(2_000_000_000),
  limiteEmpresas: limite,
  limiteUsuarios: limite,
  escritorioNome: z.string().trim().min(2).max(120),
  adminNome: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email().max(200),
  codigo: z.string().trim().max(40).optional(),
});

const alterarSchema = z.object({
  acao: z.literal("alterar"),
  plano: plano.optional(),
  mensalCents: z.number().int().min(0).max(2_000_000_000).optional(),
  limiteEmpresas: limite.optional(),
  limiteUsuarios: limite.optional(),
});

const corpoSchema = z.discriminatedUnion("acao", [
  ativarSchema,
  alterarSchema,
  z.object({ acao: z.literal("suspender"), motivo: z.string().trim().min(3).max(200) }),
  z.object({ acao: z.literal("reativar") }),
  z.object({ acao: z.literal("redefinir-senha"), email: z.string().trim().toLowerCase().email() }),
  z.object({ acao: z.literal("sincronizar") }),
]);

const falha = (e: unknown) =>
  NextResponse.json({ error: e instanceof ErpIndisponivelError ? e.message : "Falha inesperada ao falar com o ERP." }, { status: e instanceof ErpIndisponivelError ? 502 : 500 });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const erp = await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: params.id } });
  return NextResponse.json({ configurado: erpConfigurado(), erp, planos: ERP_PLANOS });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", detalhes: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true, subscription: { select: { id: true, amountCents: true } } } });
  if (!tenant) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const existente = await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: tenant.id } });
  const auditar = (action: string, metadata: Record<string, unknown>) => logAudit({ actor: admin, action, targetTenantId: tenant.id, targetTenantName: tenant.name, metadata });

  if (d.acao === "ativar") {
    if (existente) return NextResponse.json({ error: "Esta empresa já tem o ERP ativado." }, { status: 409 });
    try {
      const r = await criarEscritorio({
        zapTenantId: tenant.id, nome: d.escritorioNome, slug: d.codigo || undefined, adminNome: d.adminNome, adminEmail: d.adminEmail,
        limiteEmpresas: d.limiteEmpresas, limiteUsuarios: d.limiteUsuarios,
      });
      const e = r.escritorio;
      await prisma.$transaction(async (tx) => {
        await tx.tenantErpContabilidade.create({
          data: { tenantId: tenant.id, escritorioId: e.id, escritorioSlug: e.slug, loginUrl: e.urlLogin, plano: d.plano, mensalCents: d.mensalCents, limiteEmpresas: d.limiteEmpresas, limiteUsuarios: d.limiteUsuarios },
        });
        if (tenant.subscription && d.mensalCents > 0) {
          await tx.subscription.update({ where: { id: tenant.subscription.id }, data: { amountCents: novoTotalDaAssinatura(tenant.subscription.amountCents, 0, d.mensalCents) } });
        }
      });
      const local = await prisma.tenantErpContabilidade.findUniqueOrThrow({ where: { tenantId: tenant.id } });
      await guardarUso(tenant.id, e);
      await auditar("erp.ativar", { plano: d.plano, mensalCents: d.mensalCents, slug: e.slug, criado: r.criado });
      return NextResponse.json({
        erp: local,
        // A senha provisória só existe neste momento; o ERP não a devolve de novo.
        admin: r.admin ?? null,
        avisoCobranca: tenant.subscription && d.mensalCents > 0 ? "O total da assinatura foi atualizado. Se a cobrança recorrente já existe no Mercado Pago/Asaas, gere um novo link de pagamento com o valor novo." : null,
      });
    } catch (e) {
      return falha(e);
    }
  }

  if (!existente) return NextResponse.json({ error: "O ERP ainda não foi ativado para esta empresa." }, { status: 409 });

  try {
    if (d.acao === "alterar") {
      const novoPlano = d.plano ?? existente.plano;
      const lE = d.limiteEmpresas !== undefined ? d.limiteEmpresas : existente.limiteEmpresas;
      const lU = d.limiteUsuarios !== undefined ? d.limiteUsuarios : existente.limiteUsuarios;
      const novoMensal = d.mensalCents ?? existente.mensalCents;
      const e = await atualizarEscritorio(tenant.id, { limiteEmpresas: lE, limiteUsuarios: lU });
      await prisma.$transaction(async (tx) => {
        await tx.tenantErpContabilidade.update({ where: { tenantId: tenant.id }, data: { plano: novoPlano, limiteEmpresas: lE, limiteUsuarios: lU, mensalCents: novoMensal } });
        if (tenant.subscription && novoMensal !== existente.mensalCents) {
          await tx.subscription.update({ where: { id: tenant.subscription.id }, data: { amountCents: novoTotalDaAssinatura(tenant.subscription.amountCents, existente.mensalCents, novoMensal) } });
        }
      });
      await guardarUso(tenant.id, e);
      await auditar("erp.alterar", { de: { plano: existente.plano, mensalCents: existente.mensalCents, limiteEmpresas: existente.limiteEmpresas, limiteUsuarios: existente.limiteUsuarios }, para: { plano: novoPlano, mensalCents: novoMensal, limiteEmpresas: lE, limiteUsuarios: lU } });
      return NextResponse.json({
        erp: await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: tenant.id } }),
        avisoCobranca: tenant.subscription && novoMensal !== existente.mensalCents ? "O total da assinatura mudou. Cobranças recorrentes já criadas no Mercado Pago/Asaas continuam com o valor antigo até gerar um novo link de pagamento." : null,
      });
    }

    if (d.acao === "suspender") {
      const e = await atualizarEscritorio(tenant.id, { ativo: false, motivo: d.motivo });
      await prisma.tenantErpContabilidade.update({ where: { tenantId: tenant.id }, data: { status: "SUSPENSO", suspensoPor: "MANUAL", suspensoMotivo: d.motivo, suspensoEm: new Date() } });
      await guardarUso(tenant.id, e);
      await auditar("erp.suspender", { motivo: d.motivo });
      return NextResponse.json({ erp: await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: tenant.id } }) });
    }

    if (d.acao === "reativar") {
      const e = await atualizarEscritorio(tenant.id, { ativo: true });
      await prisma.tenantErpContabilidade.update({ where: { tenantId: tenant.id }, data: { status: "ATIVO", suspensoPor: null, suspensoMotivo: null, suspensoEm: null } });
      await guardarUso(tenant.id, e);
      await auditar("erp.reativar", {});
      // Se a cobrança ainda manda suspender, a próxima varredura suspende de novo — avisamos para não surpreender.
      const sync = await sincronizarErp(tenant.id);
      return NextResponse.json({ erp: await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: tenant.id } }), avisoCobranca: sync.acao === "SUSPENDER" ? `Reativado, mas a cobrança ainda pede suspensão (${sync.motivo}); o ERP foi suspenso de novo.` : null });
    }

    if (d.acao === "redefinir-senha") {
      const r = await redefinirSenha(tenant.id, d.email);
      await auditar("erp.redefinir-senha", { email: d.email });
      return NextResponse.json({ admin: r });
    }

    // sincronizar
    const r = await sincronizarErp(tenant.id);
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 502 });
    await auditar("erp.sincronizar", { acao: r.acao, motivo: r.motivo ?? null });
    return NextResponse.json({ resultado: r, erp: await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: tenant.id } }) });
  } catch (e) {
    return falha(e);
  }
}

// Consulta direta ao ERP, para o painel mostrar o uso em tempo real sem esperar a varredura.
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  try {
    const e = await consultarEscritorio(params.id);
    if (!e) return NextResponse.json({ error: "Escritório não encontrado no ERP." }, { status: 404 });
    await guardarUso(params.id, e);
    return NextResponse.json({ erp: await prisma.tenantErpContabilidade.findUnique({ where: { tenantId: params.id } }) });
  } catch (e) {
    return falha(e);
  }
}
