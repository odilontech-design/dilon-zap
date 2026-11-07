import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { slugUnico } from "@/lib/tenant-slug";
import { excluirEmpresaNoBanco, impactoDaExclusao } from "@/lib/excluir-empresa";
import { disconnectWhatsApp } from "@/lib/worker-client";
import { esquecerSuspensao } from "@/lib/suspensao";
import { deleteMediaPrefix, isStorageConfigured } from "@dilon-zap/storage";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      // Campos explícitos: sem o select, o include devolvia o registro
      // inteiro — passwordHash junto — e o hash bcrypt de cada usuário ia
      // parar no navegador, no cache e na aba de rede. Só SUPERADMIN vê esta
      // tela, mas isso não é motivo pra mandar hash de senha pro cliente.
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true, deactivatedAt: true },
        orderBy: { createdAt: "asc" },
      },
      sessions: { orderBy: { createdAt: "desc" } },
      subscription: true,
      // Exceções de recurso: o painel de plano precisa delas pra mostrar o
      // que o cliente de fato tem, e não só o que o plano define.
      recursos: { select: { recurso: true, ativo: true, motivo: true } },
      invoices: { orderBy: { dueDate: "desc" }, take: 24 },
      _count: { select: { contacts: true, conversations: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });

  const recentAudit = await prisma.auditLog.findMany({
    where: { targetTenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ tenant, recentAudit });
}

const patchSchema = z.object({ name: z.string().min(2).max(120) });

/**
 * Renomear a empresa.
 *
 * Nome errado na hora de cadastrar (typo, razão social trocada pelo nome
 * fantasia) era coisa que só saía do ar mexendo no banco. O slug acompanha o
 * nome porque ele é derivado dele e só aparece como identificação no painel
 * — nada de rota nem login depende dele, então recalcular não quebra sessão
 * de ninguém.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  const name = parsed.data.name.trim();
  const slug = await slugUnico(name, tenant.id);

  const atualizado = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { name, slug },
    select: { id: true, name: true, slug: true },
  });

  await logAudit({
    actor: admin,
    action: "tenant.rename",
    targetTenantId: tenant.id,
    targetTenantName: atualizado.name,
    metadata: { de: tenant.name, para: atualizado.name, slugAnterior: tenant.slug, slug: atualizado.slug },
  });

  return NextResponse.json(atualizado);
}

const excluirSchema = z.object({ confirmaNome: z.string() });

/**
 * Exclui a empresa e tudo que é dela (empresa que não usa a ferramenta).
 *
 * Definitivo: o único caminho de volta é o backup diário do banco. Por isso a
 * confirmação exige o nome da empresa digitado, os impeditivos do
 * impactoDaExclusao valem aqui de novo (a tela pode estar desatualizada) e a
 * ação fica no log de auditoria, que não é apagado junto.
 *
 * Ordem: 1) desconecta o WhatsApp (tira o aparelho vinculado e impede o worker
 * de manter o socket de uma sessão que vai sumir); 2) apaga no banco, em
 * cascata; 3) apaga as mídias do R2. Falha no R2 não desfaz o banco: vira
 * aviso no log para limpar depois.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const parsed = excluirSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "confirmação ausente" }, { status: 400 });

  const impacto = await impactoDaExclusao(params.id, admin.tenantId);
  if (!impacto) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  if (impacto.impeditivos.length) {
    return NextResponse.json({ error: impacto.impeditivos.join(" "), impeditivos: impacto.impeditivos }, { status: 409 });
  }
  if (parsed.data.confirmaNome.trim().toLowerCase() !== impacto.nome.trim().toLowerCase()) {
    return NextResponse.json({ error: "o nome digitado não confere com o da empresa" }, { status: 400 });
  }

  const sessoes = await prisma.whatsAppSession.findMany({ where: { tenantId: impacto.id }, select: { id: true, status: true } });
  for (const sessao of sessoes) {
    if (sessao.status === "CONNECTED" || sessao.status === "DISCONNECTED") {
      await disconnectWhatsApp(impacto.id, sessao.id).catch(() => undefined);
    }
  }
  if (sessoes.length) await new Promise((r) => setTimeout(r, 2500));

  // Auditoria antes: se o banco recusar, o registro diz que foi tentado; se
  // der certo, é o único rastro da empresa.
  await logAudit({
    actor: admin,
    action: "tenant.excluir",
    targetTenantId: impacto.id,
    targetTenantName: impacto.nome,
    metadata: {
      usuarios: impacto.usuarios,
      contatos: impacto.contatos,
      conversas: impacto.conversas,
      mensagens: impacto.mensagens,
      pedidos: impacto.pedidos,
      sessoes: impacto.sessoes,
      ultimaMensagemEm: impacto.ultimaMensagemEm,
    },
  });

  await excluirEmpresaNoBanco(impacto.id);
  esquecerSuspensao(impacto.id);

  let midiasApagadas: number | null = null;
  let avisoMidia: string | null = null;
  if (isStorageConfigured()) {
    try {
      midiasApagadas = await deleteMediaPrefix(`${impacto.id}/`);
    } catch (err) {
      avisoMidia = (err as Error).message;
      console.error("[admin] empresa excluída, mas falhou limpar as mídias do R2", impacto.id, err);
    }
  }

  return NextResponse.json({ ok: true, midiasApagadas, avisoMidia });
}
