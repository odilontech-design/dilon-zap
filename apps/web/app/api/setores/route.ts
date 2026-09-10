import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * Setores da empresa e quem pertence a cada um.
 *
 * Diferente da URA, aqui NÃO se salva tudo de uma vez: um setor é editado
 * sozinho, e trocar a lista inteira a cada mexida apagaria e recriaria
 * registros que estão referenciados por conversas em andamento — o
 * `onDelete: SetNull` da conversa transformaria cada salvamento numa perda
 * silenciosa do setor de atendimentos abertos.
 */

const criarSchema = z.object({
  nome: z.string().min(1, "dê um nome ao setor").max(40),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor inválida")
    .default("#0F766E"),
  membros: z.array(z.string()).default([]),
});

export async function GET() {
  const user = await requireUser();

  const setores = await prisma.setor.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      nome: true,
      cor: true,
      ativo: true,
      membros: {
        select: { user: { select: { id: true, name: true, deactivatedAt: true } } },
      },
      _count: { select: { conversas: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(
    setores.map((s) => ({
      id: s.id,
      nome: s.nome,
      cor: s.cor,
      ativo: s.ativo,
      conversas: s._count.conversas,
      membros: s.membros
        .map((m) => ({
          id: m.user.id,
          nome: m.user.name,
          ativo: m.user.deactivatedAt === null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
  );
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user.role === "AGENT") {
    return NextResponse.json(
      { error: "só o responsável pela conta pode criar setores" },
      { status: 403 }
    );
  }

  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const nome = parsed.data.nome.trim();
  const membros = [...new Set(parsed.data.membros)];

  // Membro tem que ser gente desta empresa. Sem a checagem, um id de outro
  // tenant vindo na requisição daria a alguém de fora acesso à fila daqui.
  if (membros.length > 0) {
    const validos = await prisma.user.count({
      where: { id: { in: membros }, tenantId: user.tenantId },
    });
    if (validos !== membros.length) {
      return NextResponse.json(
        { error: "um dos membros não faz parte da sua equipe" },
        { status: 400 }
      );
    }
  }

  const jaExiste = await prisma.setor.findFirst({
    where: { tenantId: user.tenantId, nome },
    select: { id: true },
  });
  if (jaExiste) {
    return NextResponse.json({ error: `já existe um setor chamado "${nome}"` }, { status: 409 });
  }

  const setor = await prisma.setor.create({
    data: {
      tenantId: user.tenantId,
      nome,
      cor: parsed.data.cor,
      membros: { create: membros.map((userId) => ({ userId })) },
    },
    select: { id: true, nome: true, cor: true, ativo: true },
  });

  await logAudit({
    actor: user,
    action: "setor.create",
    metadata: { setorId: setor.id, nome, membros: membros.length },
  });

  return NextResponse.json(setor);
}
