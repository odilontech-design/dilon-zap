import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import type { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { recursosEfetivos, TODOS_RECURSOS, type Assinatura } from "@/lib/plano-regras";

/**
 * Plano, ciclo de vida e exceções de recurso de uma empresa.
 *
 * Tudo numa rota só porque as três coisas mudam juntas e precisam ser
 * conferidas juntas: trocar o plano muda quais recursos valem, e o que sai do
 * plano pode estar rodando agora mesmo — o menu de triagem, por exemplo.
 */

const recursoEnum = z.enum(["URA", "SETORES", "PEDIDOS", "CONTAS_RECEBER", "INTEGRACAO_API"]);

const corpoSchema = z.object({
  plano: z.enum(["ESSENCIAL", "PROFISSIONAL", "ESCALA"]).optional(),
  plataformaCompleta: z.boolean().optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "CANCELED"]).optional(),
  mensalCents: z.number().int().min(0).optional(),
  testeAte: z.string().datetime().nullable().optional(),
  setupCents: z.number().int().min(0).nullable().optional(),
  setupPago: z.boolean().optional(),
  motivoCancelamento: z.string().trim().max(300).optional(),
  // null remove a exceção e devolve o recurso ao padrão do plano.
  excecoes: z
    .array(z.object({ recurso: recursoEnum, ativo: z.boolean().nullable(), motivo: z.string().trim().max(200).optional() }))
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const parsed = corpoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, uraAtiva: true, subscription: true },
  });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  // Cancelar sem dizer por quê é perder a única informação que ensina alguma
  // coisa: preço, falta de uso e empresa que fechou são três conversas
  // diferentes, e sem o motivo todas viram "cancelou".
  const cancelando = d.status === "CANCELED" && tenant.subscription?.status !== "CANCELED";
  if (cancelando && !d.motivoCancelamento) {
    return NextResponse.json({ error: "informe o motivo do cancelamento" }, { status: 400 });
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const dadosAssinatura: Prisma.SubscriptionUncheckedUpdateInput = {
      ...(d.plano ? { plano: d.plano } : {}),
      ...(d.plataformaCompleta !== undefined ? { plataformaCompleta: d.plataformaCompleta } : {}),
      ...(d.status ? { status: d.status } : {}),
      ...(d.mensalCents !== undefined ? { amountCents: d.mensalCents } : {}),
      ...(d.testeAte !== undefined ? { testeAte: d.testeAte ? new Date(d.testeAte) : null } : {}),
      ...(d.setupCents !== undefined ? { setupCents: d.setupCents } : {}),
      ...(d.setupPago !== undefined ? { setupPagoEm: d.setupPago ? new Date() : null } : {}),
      ...(cancelando ? { canceladoEm: new Date(), motivoCancelamento: d.motivoCancelamento } : {}),
      // Reativar limpa o cancelamento: senão a empresa ficaria "ativa,
      // cancelada em 12/09 por preço", uma contradição no próprio cadastro.
      ...(d.status && d.status !== "CANCELED" ? { canceladoEm: null, motivoCancelamento: null } : {}),
    };

    // Empresa antiga sem assinatura ganha uma na primeira edição. Nasce com
    // plataformaCompleta: se ela não tinha assinatura, é da regra antiga.
    if (tenant.subscription) {
      await tx.subscription.update({ where: { tenantId: tenant.id }, data: dadosAssinatura });
    } else {
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          amountCents: d.mensalCents ?? 0,
          cycleDay: Math.min(new Date().getDate(), 28),
          plataformaCompleta: d.plataformaCompleta ?? true,
          plano: d.plano ?? "ESSENCIAL",
          status: d.status ?? "ACTIVE",
          testeAte: d.testeAte ? new Date(d.testeAte) : null,
          setupCents: d.setupCents ?? null,
        },
      });
    }

    for (const e of d.excecoes ?? []) {
      if (e.ativo === null) {
        await tx.tenantRecurso.deleteMany({ where: { tenantId: tenant.id, recurso: e.recurso } });
      } else {
        await tx.tenantRecurso.upsert({
          where: { tenantId_recurso: { tenantId: tenant.id, recurso: e.recurso } },
          update: { ativo: e.ativo, motivo: e.motivo || null },
          create: { tenantId: tenant.id, recurso: e.recurso, ativo: e.ativo, motivo: e.motivo || null },
        });
      }
    }

    // A consequência que um bloqueio só na rota não pega. O worker lê
    // tenant.uraAtiva e roda o menu sem saber nada de plano. Se a URA saiu do
    // plano (downgrade ou exceção), o menu que estava ligado continuaria
    // mandando "escolha uma opção" pros clientes da empresa, pra sempre.
    //
    // Desligar aqui, na mesma transação da troca, em vez de ensinar plano ao
    // worker: seria duplicar a regra num segundo aplicativo, e duas cópias de
    // regra comercial divergem na primeira alteração.
    const [assinatura, excecoes] = await Promise.all([
      tx.subscription.findUnique({
        where: { tenantId: tenant.id },
        select: { plano: true, plataformaCompleta: true },
      }),
      tx.tenantRecurso.findMany({ where: { tenantId: tenant.id }, select: { recurso: true, ativo: true } }),
    ]);
    const efetivos = recursosEfetivos(assinatura as Assinatura, excecoes);

    let uraDesligada = false;
    if (!efetivos.has("URA") && tenant.uraAtiva) {
      await tx.tenant.update({ where: { id: tenant.id }, data: { uraAtiva: false } });
      uraDesligada = true;
    }

    return { efetivos: TODOS_RECURSOS.filter((r) => efetivos.has(r)), uraDesligada };
  });

  await logAudit({
    actor: admin,
    action: "tenant.plano",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { alteracoes: d, recursosEfetivos: resultado.efetivos, uraDesligada: resultado.uraDesligada },
  });

  return NextResponse.json(resultado);
}
