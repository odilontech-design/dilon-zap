import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { idParaOlx } from "@dilon-zap/portais";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { anunciarNaOlx, desligarDaOlx, STATUS_ROTULO } from "@/lib/portais";
import { anunciarNaWebmotors, desligarDaWebmotors } from "@/lib/portais-webmotors";
import { anunciarNaMobiauto, desligarDaMobiauto } from "@/lib/portais-mobiauto";

/** Como está o anúncio deste carro na OLX (qualquer pessoa da equipe vê). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const v = await prisma.veiculo.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });
  const [pub, conta, pubWm, contaWm, pubMb, contaMb] = await Promise.all([
    prisma.publicacaoPortal.findUnique({
      where: { veiculoId_portal: { veiculoId: v.id, portal: "OLX" } },
      select: { ativo: true, status: true, url: true, erro: true, catalogo: true, enviadoEm: true, updatedAt: true },
    }),
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId: user.tenantId, portal: "OLX" } }, select: { status: true } }),
    prisma.publicacaoPortal.findUnique({
      where: { veiculoId_portal: { veiculoId: v.id, portal: "WEBMOTORS" } },
      select: { ativo: true, status: true, url: true, erro: true, enviadoEm: true, updatedAt: true },
    }),
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId: user.tenantId, portal: "WEBMOTORS" } }, select: { status: true } }),
    prisma.publicacaoPortal.findUnique({
      where: { veiculoId_portal: { veiculoId: v.id, portal: "MOBIAUTO" } },
      select: { ativo: true, status: true, url: true, erro: true, enviadoEm: true, updatedAt: true },
    }),
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId: user.tenantId, portal: "MOBIAUTO" } }, select: { status: true } }),
  ]);
  return NextResponse.json({
    contaOlx: conta?.status ?? null,
    olx: pub ? { ...pub, rotulo: pub.ativo ? STATUS_ROTULO[pub.status] : "Não anunciar" } : null,
    contaMobiauto: contaMb?.status ?? null,
    mobiauto: pubMb ? { ...pubMb, rotulo: pubMb.ativo ? STATUS_ROTULO[pubMb.status].replace("a OLX", "a MobiAuto") : "Não anunciar" } : null,
    contaWebmotors: contaWm?.status ?? null,
    webmotors: pubWm ? { ...pubWm, rotulo: pubWm.ativo ? STATUS_ROTULO[pubWm.status].replace("a OLX", "a Webmotors") : "Não anunciar" } : null,
  });
}

const corpo = z.object({
  portal: z.enum(["OLX", "WEBMOTORS", "MOBIAUTO"]).default("OLX"),
  ativo: z.boolean(),
  catalogo: z.object({ marca: z.string().regex(/^\d+$/), modelo: z.string().regex(/^\d+$/), versao: z.string().regex(/^\d+$/) }).nullable().optional(),
});

/** Liga ou desliga o anúncio deste carro e guarda a escolha do catálogo da OLX. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão anuncia nos portais" }, { status: 403 });
  const parsed = corpo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const v = await prisma.veiculo.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });

  if (parsed.data.portal === "MOBIAUTO") {
    if (parsed.data.ativo) await anunciarNaMobiauto(user.tenantId, [v.id]);
    else await desligarDaMobiauto(user.tenantId, v.id);
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.portal === "WEBMOTORS") {
    if (parsed.data.ativo) await anunciarNaWebmotors(user.tenantId, [v.id]);
    else await desligarDaWebmotors(user.tenantId, v.id);
    return NextResponse.json({ ok: true });
  }
  if (!parsed.data.ativo) {
    await desligarDaOlx(user.tenantId, v.id);
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.catalogo) {
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: v.id, portal: "OLX" } },
      create: { tenantId: user.tenantId, veiculoId: v.id, portal: "OLX", idEnviado: idParaOlx(v.id), catalogo: parsed.data.catalogo },
      update: { ativo: true, catalogo: parsed.data.catalogo, erro: null, proximaTentativaEm: null },
    });
  } else {
    await anunciarNaOlx(user.tenantId, [v.id]);
  }
  return NextResponse.json({ ok: true });
}
