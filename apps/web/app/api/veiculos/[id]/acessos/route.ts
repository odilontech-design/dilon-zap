import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/** Os acessos ao carro na vitrine nos últimos dias (visitas, cliques no WhatsApp e formulários), dia a dia. Só a gestão, só carros da loja. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  const dias = [7, 30, 90].includes(Number(new URL(req.url).searchParams.get("dias"))) ? Number(new URL(req.url).searchParams.get("dias")) : 30;
  const v = await prisma.veiculo.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });
  const desde = new Date(Date.now() - (dias - 1) * 86_400_000);
  desde.setUTCHours(0, 0, 0, 0);
  const linhas = await prisma.estatisticaVitrine.findMany({ where: { tenantId: user.tenantId, veiculoId: v.id, dia: { gte: desde } }, orderBy: { dia: "asc" }, select: { dia: true, visitas: true, whatsapp: true, formularios: true } });
  const porDia = new Map(linhas.map((l) => [l.dia.toISOString().slice(0, 10), l]));
  const serie = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const l = porDia.get(d);
    return { dia: d, visitas: l?.visitas ?? 0, whatsapp: l?.whatsapp ?? 0, formularios: l?.formularios ?? 0 };
  });
  const soma = (k: "visitas" | "whatsapp" | "formularios") => serie.reduce((t, x) => t + x[k], 0);
  return NextResponse.json({ dias, serie, total: { visitas: soma("visitas"), whatsapp: soma("whatsapp"), formularios: soma("formularios") } });
}
