import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { slugUnico } from "@/lib/tenant-slug";
import { DIAS_DE_TESTE } from "@/lib/saas";

/**
 * Aprovar ou recusar um autocadastro.
 *
 * Aprovar CRIA a empresa com os dados do pedido — mesma receita do botão
 * "Nova empresa" (ver /api/admin/tenants): empresa, responsável com senha
 * provisória e assinatura em teste. A senha volta na resposta UMA vez, pra
 * Dilon Tech repassar; ela não fica guardada em lugar nenhum legível.
 */

function gerarSenha() {
  return randomBytes(9).toString("base64url"); // 12 chars, sem confundir com telefone/ID
}

const schema = z.object({
  acao: z.enum(["aprovar", "recusar"]),
  motivo: z.string().trim().max(300).optional(),
  plano: z.enum(["ESSENCIAL", "PROFISSIONAL", "ESCALA"]).default("ESSENCIAL"),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pedido = await prisma.solicitacaoDeAcesso.findUnique({ where: { id: params.id } });
  if (!pedido) return NextResponse.json({ error: "cadastro não encontrado" }, { status: 404 });

  // Decidir duas vezes criaria uma segunda empresa pro mesmo pedido — dois
  // cliques no botão bastariam.
  if (pedido.status !== "PENDENTE") {
    return NextResponse.json({ error: "este cadastro já foi decidido" }, { status: 409 });
  }

  if (parsed.data.acao === "recusar") {
    await prisma.solicitacaoDeAcesso.update({
      where: { id: pedido.id },
      data: {
        status: "RECUSADA",
        motivo: parsed.data.motivo || null,
        decididoEm: new Date(),
        decididoById: admin.id,
      },
    });
    await logAudit({
      actor: admin,
      action: "solicitacao.recusar",
      metadata: { solicitacaoId: pedido.id, email: pedido.email },
    });
    return NextResponse.json({ ok: true });
  }

  // Entre o cadastro e a aprovação alguém pode ter criado a conta à mão. O
  // e-mail é o login: deixar passar quebraria a criação com erro de banco.
  const jaExiste = await prisma.user.findUnique({ where: { email: pedido.email }, select: { id: true } });
  if (jaExiste) {
    return NextResponse.json(
      { error: "já existe um usuário com esse e-mail. Recuse este cadastro." },
      { status: 409 }
    );
  }

  const senha = gerarSenha();
  const passwordHash = await bcrypt.hash(senha, 10);
  const slug = await slugUnico(pedido.empresa);

  // Criar a empresa e marcar o pedido andam juntos: separados, uma falha no
  // meio deixaria empresa criada com o cadastro ainda PENDENTE — e o próximo
  // clique criaria a segunda.
  const tenant = await prisma.$transaction(async (tx) => {
    const criado = await tx.tenant.create({
      data: {
        name: pedido.empresa,
        slug,
        users: {
          create: {
            name: pedido.nome,
            email: pedido.email,
            passwordHash,
            role: "OWNER",
            senhaProvisoria: true,
          },
        },
        sessions: { create: { label: "Principal" } },
        subscription: {
          create: {
            status: "TRIAL",
            plano: parsed.data.plano,
            // Quem entra agora segue a escada de planos; a promessa antiga
            // vale só pra quem já estava dentro.
            plataformaCompleta: false,
            amountCents: 0,
            cycleDay: Math.min(new Date().getDate(), 28),
            testeAte: new Date(Date.now() + DIAS_DE_TESTE * 86_400_000),
          },
        },
      },
    });

    await tx.solicitacaoDeAcesso.update({
      where: { id: pedido.id },
      data: {
        status: "APROVADA",
        decididoEm: new Date(),
        decididoById: admin.id,
        tenantId: criado.id,
      },
    });

    return criado;
  });

  await logAudit({
    actor: admin,
    action: "solicitacao.aprovar",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { solicitacaoId: pedido.id, ownerEmail: pedido.email },
  });

  // A senha sai daqui e não volta: não é guardada em texto em lugar nenhum.
  return NextResponse.json({ ok: true, tenantId: tenant.id, email: pedido.email, senha });
}
