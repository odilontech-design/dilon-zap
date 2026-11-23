import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { primeirosPassosDaRevenda } from "@/lib/primeiros-passos";

/** Todas as revendas com a implantação de cada uma: quem está parado, quem já pegou. */
export async function GET() {
  await requireSuperAdmin();
  // Empresas com o recurso de veículos ligado explicitamente ou com plano de revenda. A conferência fina
  // (recursosDoTenant) acontece dentro de primeirosPassosDaRevenda, que devolve null para quem não tem.
  const candidatas = await prisma.tenant.findMany({
    where: { OR: [{ veiculosConfig: { isNot: null } }, { recursos: { some: { recurso: "VEICULOS", ativo: true } } }] },
    select: { id: true, name: true, slug: true, veiculosConfig: { select: { plano: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const linhas = [];
  for (const t of candidatas) {
    const r = await primeirosPassosDaRevenda(t.id);
    if (!r) continue;
    linhas.push({
      id: t.id,
      nome: t.name,
      slug: t.slug,
      plano: t.veiculosConfig?.plano ?? null,
      percentual: r.percentual,
      feitos: r.feitos,
      total: r.total,
      pendentes: r.passos.filter((p) => p.obrigatorio && p.estado !== "feito").map((p) => p.titulo),
      ...r.resumo,
    });
  }
  return NextResponse.json({ revendas: linhas }, { headers: { "Cache-Control": "no-store" } });
}
