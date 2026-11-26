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
  respostaImediata: z.boolean().default(false),
  respostaImediataPorHora: z.number().int().min(1).max(60).default(10),
  acompanhamento: z.boolean().default(false),
  acompanhamentoPorHora: z.number().int().min(1).max(30).default(5),
  rodizio: z.boolean().default(false),
  rodizioUsuarioIds: z.array(z.string()).max(50).default([]),
});

/** Configuração e painel do mês do Vendedor IA. Só a gestão. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VENDEDOR_IA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão configura o Vendedor IA" }, { status: 403 });

  const [config, setores, painel, usuarios] = await Promise.all([
    configDoVendedorIa(user.tenantId),
    prisma.setor.findMany({ where: { tenantId: user.tenantId }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    painelDoMes(user.tenantId),
    // Quem pode entrar no rodízio: os usuários ativos da empresa (a gestão marca quem participa).
    prisma.user.findMany({ where: { tenantId: user.tenantId, deactivatedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
  ]);
  return NextResponse.json({ config, setores, painel, usuarios, estimativas: estimativas() });
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
  // Só entra no rodízio gente da própria empresa e ativa; a ordem marcada na tela é a ordem do rodízio.
  const validos = new Set((await prisma.user.findMany({ where: { id: { in: d.rodizioUsuarioIds }, tenantId: user.tenantId, deactivatedAt: null }, select: { id: true } })).map((u) => u.id));
  const participantes = d.rodizioUsuarioIds.filter((id, i, a) => validos.has(id) && a.indexOf(id) === i);
  const atual = await configDoVendedorIa(user.tenantId);
  if (atual.leadsContratados !== null && d.limiteLeadsMes > atual.leadsContratados) {
    return NextResponse.json({ error: `o pacote contratado é de até ${atual.leadsContratados} leads por mês: o limite não pode passar disso` }, { status: 400 });
  }
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
      respostaImediataPorHora: d.respostaImediataPorHora,
      acompanhamentoPorHora: d.acompanhamentoPorHora,
      rodizio: d.rodizio,
      rodizioUsuarioIds: participantes,
      // Ao ligar, o relógio começa agora: só conversas que começarem daqui em diante entram no acompanhamento.
      ...(d.acompanhamento !== atual.acompanhamento ? { acompanhamento: d.acompanhamento, acompanhamentoDesde: d.acompanhamento ? new Date() : null } : {}),
      // Ao ligar, o relógio começa agora: só leads que chegarem daqui em diante recebem a resposta imediata.
      ...(d.respostaImediata !== atual.respostaImediata ? { respostaImediata: d.respostaImediata, respostaImediataDesde: d.respostaImediata ? new Date() : null } : {}),
    },
  });
  await ligarOuDesligar(user.tenantId, d.ativo);
  await logAudit({ actor: user, action: "vendedor-ia.config", metadata: { ativo: d.ativo, modelo: d.modelo, esforco: d.esforco, respostaImediata: d.respostaImediata, respostaImediataPorHora: d.respostaImediataPorHora, acompanhamento: d.acompanhamento, acompanhamentoPorHora: d.acompanhamentoPorHora, rodizio: d.rodizio, rodizioUsuarioIds: participantes } });
  return NextResponse.json({ ok: true });
}
