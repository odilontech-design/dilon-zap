import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { PRECOS } from "@dilon-zap/vendedor-ia";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { ESFORCOS, configDoVendedorIa, estimativas, ligarOuDesligar, painelDoMes } from "@/lib/vendedor-ia";

const corpo = z.object({
  ativo: z.boolean(),
  nomeAssistente: z.string().trim().min(1).max(40),
  instrucoes: z.string().trim().max(4000).nullable(),
  modelo: z.string().refine((m) => m in PRECOS, "modelo não suportado"),
  esforco: z.enum(ESFORCOS),
  setorTransferenciaId: z.string().nullable(),
  limiteLeadsMes: z.number().int().min(1).max(100_000),
  limiteCustoMesCents: z.number().int().min(100).max(10_000_000).nullable(),
});

/** Configuração e painel do mês do Vendedor IA. Só a gestão. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VENDEDOR_IA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão configura o Vendedor IA" }, { status: 403 });

  const [config, setores, painel] = await Promise.all([
    configDoVendedorIa(user.tenantId),
    prisma.setor.findMany({ where: { tenantId: user.tenantId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    painelDoMes(user.tenantId),
  ]);
  return NextResponse.json({ config, setores, painel, estimativas: estimativas() });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VENDEDOR_IA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão configura o Vendedor IA" }, { status: 403 });

  const parsed = corpo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.setorTransferenciaId) {
    const s = await prisma.setor.findFirst({ where: { id: d.setorTransferenciaId, tenantId: user.tenantId }, select: { id: true } });
    if (!s) return NextResponse.json({ error: "setor não encontrado" }, { status: 404 });
  }
  await configDoVendedorIa(user.tenantId);
  await prisma.vendedorIaConfig.update({
    where: { tenantId: user.tenantId },
    data: {
      nomeAssistente: d.nomeAssistente,
      instrucoes: d.instrucoes || null,
      modelo: d.modelo,
      esforco: d.esforco,
      setorTransferenciaId: d.setorTransferenciaId,
      limiteLeadsMes: d.limiteLeadsMes,
      limiteCustoMesCents: d.limiteCustoMesCents,
    },
  });
  await ligarOuDesligar(user.tenantId, d.ativo);
  await logAudit({ actor: user, action: "vendedor-ia.config", metadata: { ativo: d.ativo, modelo: d.modelo, esforco: d.esforco } });
  return NextResponse.json({ ok: true });
}
