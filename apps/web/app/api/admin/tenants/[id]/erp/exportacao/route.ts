import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { baixarExportacao, ErpIndisponivelError } from "@/lib/erp-contabilidade";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Baixa a exportação dos dados do escritório (?tipo=planilhas|arquivos): o ERP gera, o Zap repassa. É o que a
 * Dilon Tech usa quando o cliente pede os dados, inclusive se o escritório está suspenso e não consegue entrar.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true, erpContabilidade: { select: { id: true } } } });
  if (!tenant?.erpContabilidade) return NextResponse.json({ error: "Esta empresa não tem o ERP ativado." }, { status: 404 });
  const tipo = new URL(req.url).searchParams.get("tipo") === "arquivos" ? "arquivos" : "planilhas";
  try {
    const r = await baixarExportacao(tenant.id, tipo);
    await logAudit({ actor: admin, action: "erp.exportar-dados", targetTenantId: tenant.id, targetTenantName: tenant.name, metadata: { tipo } });
    return new Response(r.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": r.headers.get("content-disposition") ?? `attachment; filename="exportacao-${tipo}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ErpIndisponivelError ? e.message : "Falha inesperada ao gerar a exportação." }, { status: e instanceof ErpIndisponivelError && e.status === 404 ? 404 : 502 });
  }
}
