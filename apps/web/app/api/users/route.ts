import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { vagaDeAtendente } from "@/lib/plano";
import { logAudit } from "@/lib/audit";

/**
 * Sem `incluirInativos`: lista enxuta pros seletores de atribuição, e só de
 * gente ativa — atribuir uma conversa a quem foi desligado é criar um
 * atendimento que ninguém vai ver.
 *
 * Com `incluirInativos=1`: a lista completa da tela de gestão, restrita ao
 * responsável pela conta. O parâmetro não afrouxa nada sozinho: quem não é
 * OWNER recebe a lista enxuta de qualquer jeito.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const gestao =
    new URL(req.url).searchParams.get("incluirInativos") === "1" && user.role === "OWNER";

  if (!gestao) {
    const users = await prisma.user.findMany({
      where: { tenantId: user.tenantId, deactivatedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  }

  const users = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: { not: "SUPERADMIN" } },
    select: { id: true, name: true, email: true, role: true, createdAt: true, deactivatedAt: true },
    // Ativos primeiro; desligados descem pro fim da lista sem sumir.
    orderBy: [{ deactivatedAt: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(users);
}

const criarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["OWNER", "AGENT", "FINANCEIRO"]),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (user.role !== "OWNER") return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Teto do plano. É o único item que diferencia os planos no site e que o
  // sistema consegue fazer valer — e antes não era conferido em lugar nenhum:
  // nada impedia o Essencial de cadastrar o nono atendente.
  //
  // A mensagem diz o número e o plano. "Limite atingido" sozinho faria o
  // responsável achar que é defeito e abrir chamado, em vez de entender que é
  // hora de mudar de plano.
  const vaga = await vagaDeAtendente(user.tenantId);
  if (!vaga.cabe) {
    return NextResponse.json(
      {
        error: `O plano ${vaga.plano} permite até ${vaga.limite} atendentes, e a equipe já tem ${vaga.ativos}. Desative alguém que saiu ou fale com a Dilon Tech para mudar de plano.`,
        limiteAtingido: true,
      },
      { status: 409 }
    );
  }

  // E-mail é único no sistema inteiro, não por empresa — então o conflito
  // pode ser com uma conta de outro tenant, que este OWNER não pode ver.
  // Por isso a mensagem não confirma nem nega onde o e-mail já existe.
  const existente = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existente) {
    return NextResponse.json({ error: "esse e-mail já está em uso" }, { status: 409 });
  }

  const criado = await prisma.user.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true, deactivatedAt: true },
  });

  await logAudit({
    actor: user,
    action: "user.create",
    metadata: { userId: criado.id, name: criado.name, email: criado.email, role: criado.role },
  });

  return NextResponse.json(criado, { status: 201 });
}
