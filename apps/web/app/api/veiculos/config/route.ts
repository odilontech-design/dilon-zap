import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { configRevendaSchema } from "@/lib/veiculos-schemas";
import { baseDaLoja, configDaRevenda, linkDaLoja, normalizarDominio, normalizarWhatsapp } from "@/lib/vitrine";
import { corValida, linkFacebook, linkInstagram } from "@/lib/vitrine-aparencia";
import { temCatalogoMeta, type PlanoVeiculos } from "@/lib/veiculos-planos";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/** Configuração da vitrine pública. Ler e mudar é da gestão. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const [cfg, tenant, numero] = await Promise.all([
    configDaRevenda(user.tenantId),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { slug: true, name: true } }),
    numeroGeral(user.tenantId),
  ]);
  const base = `${baseDaLoja(null)}/api/loja/${tenant.slug}/feed`;
  const { logoKey, bannerKey, ...publico } = cfg;
  return NextResponse.json({
    ...publico,
    temLogo: !!logoKey,
    temBanner: !!bannerKey,
    slug: tenant.slug,
    link: linkDaLoja(tenant.slug, cfg.dominio),
    linkSemDominio: linkDaLoja(tenant.slug),
    hostDoSistema: (() => {
      try {
        return new URL(baseDaLoja(null)).hostname;
      } catch {
        return null;
      }
    })(),
    feeds: { facebook: temCatalogoMeta(cfg.plano as PlanoVeiculos | null) ? `${base}/facebook.csv` : null, xml: `${base}/estoque.xml`, json: `${base}/estoque.json` },
    nomeEmpresa: tenant.name,
    numeroConectado: numero?.phoneNumber ?? null,
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = configRevendaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const whatsapp = normalizarWhatsapp(d.whatsapp);
  if (d.whatsapp && (!whatsapp || whatsapp.length < 12)) return NextResponse.json({ error: "WhatsApp inválido: use DDD + número" }, { status: 400 });

  const dominio = d.dominio ? normalizarDominio(d.dominio) : null;
  if (d.dominio && !dominio) return NextResponse.json({ error: "domínio inválido: use algo como www.sualoja.com.br" }, { status: 400 });
  if (dominio) {
    const dono = await prisma.veiculosConfig.findFirst({ where: { dominio, NOT: { tenantId: user.tenantId } }, select: { tenantId: true } });
    if (dono) return NextResponse.json({ error: "este domínio já está cadastrado em outra loja" }, { status: 409 });
  }

  if (d.instagram && !linkInstagram(d.instagram)) return NextResponse.json({ error: "Instagram inválido: use @usuario ou o endereço do perfil" }, { status: 400 });
  if (d.facebook && !linkFacebook(d.facebook)) return NextResponse.json({ error: "Facebook inválido: use o nome da página ou o endereço dela" }, { status: 400 });

  const dados = {
    vitrineAtiva: d.vitrineAtiva,
    dominio,
    metaPixelId: d.metaPixelId || null,
    ga4Id: d.ga4Id || null,
    formularioAtivo: d.formularioAtivo,
    whatsapp,
    nomeLoja: d.nomeLoja || null,
    endereco: d.endereco || null,
    sobre: d.sobre || null,
    mostrarReservados: d.mostrarReservados,
    corPrimaria: corValida(d.corPrimaria),
    horario: d.horario || null,
    // Guarda o que a loja digitou (o link é remontado na vitrine, nunca repassado como veio).
    instagram: d.instagram || null,
    facebook: d.facebook || null,
    politicaPrivacidade: d.politicaPrivacidade || null,
  };
  await prisma.veiculosConfig.upsert({ where: { tenantId: user.tenantId }, create: { tenantId: user.tenantId, ...dados }, update: dados });
  await logAudit({ actor: user, action: "veiculos.config", metadata: { vitrineAtiva: d.vitrineAtiva } });
  return NextResponse.json({ ok: true });
}
