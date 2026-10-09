import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import {
  ErroDeNegocio,
  ganharNegociacao,
  moverNegociacao,
  perderNegociacao,
  reabrirNegociacao,
} from "@/lib/negociacoes";

async function daEmpresa(id: string, tenantId: string) {
  return prisma.negociacao.findFirst({ where: { id, tenantId } });
}

/** Detalhe + linha do tempo, para a gaveta da negociação. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const n = await prisma.negociacao.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      contact: { select: { id: true, name: true, phoneNumber: true, waJid: true } },
      responsavel: { select: { id: true, name: true } },
      motivoPerda: { select: { id: true, nome: true } },
      eventos: { orderBy: { em: "desc" } },
    },
  });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });
  return NextResponse.json(n);
}

const schema = z.object({
  // Mudanças de estado: cada uma grava o histórico.
  acao: z.enum(["mover", "ganhar", "perder", "reabrir"]).optional(),
  stageId: z.string().optional(),
  motivoPerdaId: z.string().nullable().optional(),
  detalhe: z.string().trim().max(500).nullable().optional(),
  // Edição de campos.
  titulo: z.string().trim().min(1).max(120).optional(),
  valorCents: z.number().int().min(0).max(10_000_000_000).optional(),
  recorrencia: z.enum(["UNICA", "MENSAL"]).optional(),
  responsavelId: z.string().nullable().optional(),
  origem: z.string().trim().max(60).nullable().optional(),
  previsaoFechamento: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const n = await daEmpresa(params.id, user.tenantId);
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  try {
    if (d.responsavelId) {
      const resp = await prisma.user.findFirst({ where: { id: d.responsavelId, tenantId: user.tenantId }, select: { id: true } });
      if (!resp) return NextResponse.json({ error: "responsável inválido" }, { status: 400 });
    }

    // Campos primeiro, depois a mudança de estado: "ganhar com o valor corrigido"
    // é um gesto só na tela e precisa gravar o valor novo no ganho.
    const campos = {
      ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
      ...(d.valorCents !== undefined ? { valorCents: d.valorCents } : {}),
      ...(d.recorrencia !== undefined ? { recorrencia: d.recorrencia } : {}),
      ...(d.responsavelId !== undefined ? { responsavelId: d.responsavelId } : {}),
      ...(d.origem !== undefined ? { origem: d.origem || null } : {}),
      ...(d.previsaoFechamento !== undefined
        ? {
            previsaoFechamento: d.previsaoFechamento && !Number.isNaN(new Date(d.previsaoFechamento).getTime())
              ? new Date(d.previsaoFechamento)
              : null,
          }
        : {}),
    };
    if (Object.keys(campos).length > 0) {
      await prisma.negociacao.update({ where: { id: n.id }, data: campos });
    }

    switch (d.acao) {
      case "mover":
        if (!d.stageId) return NextResponse.json({ error: "informe a etapa" }, { status: 400 });
        await moverNegociacao(n, d.stageId, user);
        break;
      case "ganhar":
        await ganharNegociacao(n, user);
        break;
      case "perder":
        await perderNegociacao(n, user.tenantId, { motivoPerdaId: d.motivoPerdaId ?? null, detalhe: d.detalhe ?? null }, user);
        break;
      case "reabrir":
        await reabrirNegociacao(n, user, d.stageId);
        break;
    }
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  return NextResponse.json({ ok: true });
}

/** Apagar leva o histórico junto; é da gestão. O dia a dia é ganhar/perder. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão apaga negociações" }, { status: 403 });

  const n = await daEmpresa(params.id, user.tenantId);
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  await prisma.negociacao.delete({ where: { id: n.id } });
  return NextResponse.json({ ok: true });
}
