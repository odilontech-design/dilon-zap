import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { recursosDoTenant } from "@/lib/plano";
import { chamarSite, ErroDoPainel, urlDoSite } from "@/lib/painel-ecommerce";
import { ErroDeConfiguracao, lerConfigDoPainel, registrarTeste, removerConfigDoPainel, resumoDaConfig, salvarConfigDoPainel } from "@/lib/painel-ecommerce-config";

/**
 * Cadastro do painel do site de uma empresa (Super Admin): endereço e chave do site, com "Testar conexão".
 * A chave nunca volta nas respostas; só se está configurada, para onde, e o resultado do último teste.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const [config, recursos] = await Promise.all([resumoDaConfig(params.id), recursosDoTenant(params.id)]);
  return NextResponse.json({ ...config, temRecurso: recursos.has("PAINEL_ECOMMERCE") });
}

const corpo = z.object({ url: z.string().trim().min(1).max(200), chave: z.string().trim().max(500).optional() });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "informe o endereço do site" }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });
  try {
    const base = await salvarConfigDoPainel(tenant.id, parsed.data.url, parsed.data.chave ?? null);
    // O log guarda o endereço e SE a chave foi trocada; o valor da chave nunca.
    await logAudit({ actor: admin, action: "painel_ecommerce.salvar", targetTenantId: tenant.id, targetTenantName: tenant.name, metadata: { url: base, chaveTrocada: !!parsed.data.chave?.trim() } });
    return NextResponse.json({ ok: true, url: base });
  } catch (e) {
    if (e instanceof ErroDeConfiguracao) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });
  await removerConfigDoPainel(tenant.id);
  await logAudit({ actor: admin, action: "painel_ecommerce.remover", targetTenantId: tenant.id, targetTenantName: tenant.name });
  return NextResponse.json({ ok: true });
}

/** POST = "Testar conexão": usa o que foi digitado (ou, sem chave digitada, a guardada) e NÃO salva nada. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, erro: "informe o endereço do site" }, { status: 400 });

  let chave = parsed.data.chave?.trim() ?? "";
  if (!chave) {
    const guardada = await lerConfigDoPainel(params.id).catch(() => null);
    if (!guardada) return NextResponse.json({ ok: false, erro: "Informe a chave do site para testar." }, { status: 400 });
    chave = guardada.chave;
  }

  // Um dia só: o teste confere que o site responde e entende a chave, sem puxar um período grande.
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  try {
    const dados = await chamarSite({ url: parsed.data.url, chave }, hoje, hoje);
    // Só marca o resultado se o endereço testado é o que está salvo (senão o teste é de outro endereço).
    const salvo = await lerConfigDoPainel(params.id).catch(() => null);
    const testada = urlDoSite(parsed.data.url);
    if (salvo && testada.ok && salvo.url === testada.base) await registrarTeste(params.id, true);
    return NextResponse.json({ ok: true, versao: dados.versao, geradoEm: dados.geradoEm });
  } catch (e) {
    if (e instanceof ErroDoPainel) {
      await registrarTeste(params.id, false).catch(() => {});
      return NextResponse.json({ ok: false, erro: e.message });
    }
    throw e;
  }
}
