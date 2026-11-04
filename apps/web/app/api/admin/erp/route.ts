import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { erpConfigurado, ErpIndisponivelError, listarEscritorios, type ErpEscritorio } from "@/lib/erp-contabilidade";

/**
 * Panorama de todos os escritórios que usam o ERP: o que cada um paga, quanto usa do plano,
 * se aceitou o termo e se está bloqueado. Junta o cadastro local (preço e plano) com a situação
 * ao vivo do ERP; se o ERP não responder, devolve só o cadastro local, avisando.
 */
export async function GET() {
  await requireSuperAdmin();
  const locais = await prisma.tenantErpContabilidade.findMany({
    include: { tenant: { select: { id: true, name: true, subscription: { select: { status: true, amountCents: true, cycleDay: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  let ao_vivo: ErpEscritorio[] | null = null;
  let aviso: string | null = null;
  if (!erpConfigurado()) aviso = "Integração com o ERP não configurada neste ambiente.";
  else {
    try {
      ao_vivo = await listarEscritorios();
    } catch (e) {
      aviso = e instanceof ErpIndisponivelError ? e.message : "Não foi possível consultar o ERP agora.";
    }
  }
  const porTenant = new Map((ao_vivo ?? []).filter((e) => e.zapTenantId).map((e) => [e.zapTenantId as string, e]));

  const escritorios = locais.map((l) => {
    const v = porTenant.get(l.tenantId) ?? null;
    return {
      tenantId: l.tenantId,
      tenantNome: l.tenant.name,
      slug: l.escritorioSlug,
      loginUrl: l.loginUrl,
      plano: l.plano,
      mensalCents: l.mensalCents,
      statusLocal: l.status,
      suspensoMotivo: l.suspensoMotivo,
      assinatura: l.tenant.subscription?.status ?? null,
      limiteEmpresas: v ? v.limiteEmpresas : l.limiteEmpresas,
      limiteUsuarios: v ? v.limiteUsuarios : l.limiteUsuarios,
      empresasAtivas: v ? v.uso.empresasAtivas : l.empresasAtivas,
      usuariosEquipe: v ? v.uso.usuariosEquipe : l.usuariosEquipe,
      acessosPortal: v ? v.uso.acessosPortal : l.acessosPortal,
      ultimaAtividadeEm: v ? v.uso.ultimaAtividadeEm : (l.ultimaAtividadeEm?.toISOString() ?? null),
      aoVivo: Boolean(v),
      termo: v?.termo ?? null,
      aviso: v?.aviso ?? null,
    };
  });

  // Escritórios que existem no ERP mas não estão ligados a nenhuma empresa do Zap (ex.: criados à mão).
  const idsLigados = new Set(locais.map((l) => l.tenantId));
  const semVinculo = (ao_vivo ?? [])
    .filter((e) => !e.zapTenantId || !idsLigados.has(e.zapTenantId))
    .map((e) => ({ slug: e.slug, nome: e.nome, ativo: e.ativo, empresasAtivas: e.uso.empresasAtivas, usuariosEquipe: e.uso.usuariosEquipe, ultimaAtividadeEm: e.uso.ultimaAtividadeEm, zapTenantId: e.zapTenantId }));

  const ativos = escritorios.filter((e) => e.statusLocal === "ATIVO");
  const resumo = {
    escritorios: escritorios.length,
    ativos: ativos.length,
    suspensos: escritorios.length - ativos.length,
    mrrCents: ativos.reduce((s, e) => s + e.mensalCents, 0),
    empresasCliente: escritorios.reduce((s, e) => s + (e.empresasAtivas ?? 0), 0),
    usuarios: escritorios.reduce((s, e) => s + (e.usuariosEquipe ?? 0), 0),
    termosPendentes: escritorios.filter((e) => e.termo?.situacao === "PENDENTE").length,
    termosBloqueados: escritorios.filter((e) => e.termo?.bloqueado).length,
    semVinculo: semVinculo.length,
  };
  return NextResponse.json({ resumo, escritorios, semVinculo, aviso });
}
