import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * A conexão do Vendedor IA com a Anthropic, para o Super Admin. Só lê a linha que o worker do Vendedor IA mantém
 * (a chave só existe nele). POST pede um teste agora: o worker atende em poucos segundos.
 */
type Resultado = {
  modelo: string;
  ok: boolean;
  ms: number | null;
  erro: string | null;
};

async function estado() {
  const l = await prisma.vendedorIaSaude.findUnique({
    where: { id: "global" },
  });
  const emAndamento =
    !!l?.testeSolicitadoEm &&
    (!l.verificadoEm || l.testeSolicitadoEm > l.verificadoEm);
  return {
    conferido: !!l?.verificadoEm,
    chaveConfigurada: l?.chaveConfigurada ?? false,
    ok: l?.ok ?? false,
    resultados: ((l?.resultados as Resultado[] | null) ?? []).map((r) => ({
      modelo: r.modelo,
      ok: r.ok,
      ms: r.ms,
      erro: r.erro,
    })),
    verificadoEm: l?.verificadoEm ?? null,
    emAndamento,
  };
}

export async function GET() {
  await requireSuperAdmin();
  return NextResponse.json(await estado(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  const admin = await requireSuperAdmin();
  const l = await prisma.vendedorIaSaude.findUnique({
    where: { id: "global" },
    select: { testeSolicitadoEm: true, verificadoEm: true },
  });
  // Pedido em andamento (ainda sem resposta do worker): não empilha.
  if (
    l?.testeSolicitadoEm &&
    (!l.verificadoEm || l.testeSolicitadoEm > l.verificadoEm) &&
    Date.now() - l.testeSolicitadoEm.getTime() < 120_000
  ) {
    return NextResponse.json(await estado());
  }
  await prisma.vendedorIaSaude.upsert({
    where: { id: "global" },
    create: { id: "global", testeSolicitadoEm: new Date() },
    update: { testeSolicitadoEm: new Date() },
  });
  await logAudit({ actor: admin, action: "vendedor_ia.testar_conexao" });
  return NextResponse.json(await estado());
}
