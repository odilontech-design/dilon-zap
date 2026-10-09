import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { garantirFunilPadrao } from "@/lib/funis";

/** Funis ativos da empresa, com quantas negociações abertas cada um tem. */
export async function GET() {
  const user = await requireUser();
  await garantirFunilPadrao(user.tenantId);

  const funis = await prisma.funil.findMany({
    where: { tenantId: user.tenantId, arquivadoEm: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { etapas: true } } },
  });

  const abertas = await prisma.negociacao.groupBy({
    by: ["funilId"],
    where: { tenantId: user.tenantId, status: "ABERTA" },
    _count: { _all: true },
  });
  const abertasPorFunil = new Map(abertas.map((a) => [a.funilId, a._count._all]));

  return NextResponse.json(
    funis.map((f) => ({
      id: f.id,
      nome: f.nome,
      padrao: f.padrao,
      etapas: f._count.etapas,
      abertas: abertasPorFunil.get(f.id) ?? 0,
    }))
  );
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Pontos de partida. O dono escolhe um e ajusta depois — começar de uma tela
 * vazia é o que faz as pessoas desistirem de montar um funil.
 */
const MODELOS: Record<string, { nome: string; cor: string; probabilidade: number }[]> = {
  vazio: [],
  vendas: [
    { nome: "Novo", cor: "#64748B", probabilidade: 10 },
    { nome: "Qualificação", cor: "#0EA5E9", probabilidade: 25 },
    { nome: "Proposta", cor: "#F59E0B", probabilidade: 50 },
    { nome: "Negociação", cor: "#8B5CF6", probabilidade: 75 },
  ],
  saas: [
    { nome: "Lead", cor: "#64748B", probabilidade: 5 },
    { nome: "Qualificado (SQL)", cor: "#0EA5E9", probabilidade: 20 },
    { nome: "Demonstração", cor: "#6366F1", probabilidade: 40 },
    { nome: "Proposta enviada", cor: "#F59E0B", probabilidade: 60 },
    { nome: "Negociação", cor: "#8B5CF6", probabilidade: 80 },
  ],
};

const bodySchema = z.object({
  nome: z.string().trim().min(1).max(60),
  modelo: z.enum(["vazio", "vendas", "saas"]).default("vendas"),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão cria funis" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  await garantirFunilPadrao(user.tenantId);

  const existe = await prisma.funil.findUnique({
    where: { tenantId_nome: { tenantId: user.tenantId, nome: parsed.data.nome } },
  });
  if (existe) return NextResponse.json({ error: "já existe um funil com esse nome" }, { status: 409 });

  const ultimo = await prisma.funil.findFirst({ where: { tenantId: user.tenantId }, orderBy: { position: "desc" } });
  const etapas = MODELOS[parsed.data.modelo].filter((e) => HEX.test(e.cor));

  const funil = await prisma.funil.create({
    data: {
      tenantId: user.tenantId,
      nome: parsed.data.nome,
      position: (ultimo?.position ?? -1) + 1,
      etapas: {
        create: etapas.map((e, i) => ({
          tenantId: user.tenantId,
          name: e.nome,
          color: e.cor,
          probabilidade: e.probabilidade,
          position: i,
        })),
      },
    },
  });

  return NextResponse.json({ id: funil.id, nome: funil.nome });
}
