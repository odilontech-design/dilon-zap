import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { deleteMedia, uploadMedia } from "@dilon-zap/storage";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { linkDaLoja } from "@/lib/vitrine";

/**
 * "Meu site": o que a loja controla no site dela, no mesmo jeito do AutoCerto (que é o que a
 * equipe conhece): um painel de como o site está, os banners do topo, os carros em destaque e
 * a oferta que abre ao entrar, e as páginas (Quem somos e redes sociais).
 */

export const MAX_DESTAQUES = 8;
export const MAX_BANNERS = 10;
const LIMITE_BANNER = 6 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

/** As origens com que os formulários do site gravam a negociação (lib/lead-site.ts). */
const ORIGENS_DO_SITE = { anuncio: "Site", financiamento: "Site · Financiamento", vendaSeuCarro: "Site · Venda seu carro" } as const;

const ROTULO_ACAO: Record<string, string> = {
  "veiculos.config": "Dados do site",
  "veiculos.config.imagem": "Logo ou imagem do site",
  "site.banner.criar": "Banner novo",
  "site.banner.editar": "Banner alterado",
  "site.banner.excluir": "Banner removido",
  "site.destaques": "Destaques e oferta",
  "site.paginas": "Páginas do site",
  "site.trazer": "Trazido do site atual",
  "site.dados": "Dados da loja",
  "site.whatsapp": "WhatsApp do site",
  "site.avancado": "Medição (Pixel, Google)",
  "site.ficha": "Ficha de financiamento",
};

/** Link de banner: uma página do próprio site ("/...") ou um endereço https. Outra coisa vira nulo. */
export function linkDeBanner(entrada: string | null | undefined): string | null {
  const t = (entrada ?? "").trim();
  if (!t) return null;
  if (/^\/[^/\\]/.test(t) && !/\s/.test(t)) return t.slice(0, 300);
  try {
    const u = new URL(t);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function painelDoSite(tenantId: string) {
  const agora = Date.now();
  const d30 = new Date(agora - 30 * 86_400_000);
  const d60 = new Date(agora - 60 * 86_400_000);
  const [cfg, tenant, noSite, semFoto, semPreco, porOrigem, anteriores, banners, alteracoes] = await Promise.all([
    prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { vitrineAtiva: true, dominio: true, mostrarReservados: true, logoKey: true, whatsapp: true, endereco: true, destaques: true, ofertaVeiculoId: true, quemSomosTexto: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true } }),
    prisma.veiculo.count({ where: { tenantId, naVitrine: true, status: "DISPONIVEL" } }),
    prisma.veiculo.count({ where: { tenantId, naVitrine: true, status: "DISPONIVEL", fotos: { none: {} } } }),
    prisma.veiculo.count({ where: { tenantId, naVitrine: true, status: "DISPONIVEL", precoCents: { lte: 0 } } }),
    prisma.negociacao.groupBy({ by: ["origem"], where: { tenantId, origem: { in: Object.values(ORIGENS_DO_SITE) }, createdAt: { gte: d30 } }, _count: true }),
    prisma.negociacao.count({ where: { tenantId, origem: { in: Object.values(ORIGENS_DO_SITE) }, createdAt: { gte: d60, lt: d30 } } }),
    prisma.bannerVitrine.count({ where: { tenantId, ativo: true } }),
    prisma.auditLog.findMany({ where: { targetTenantId: tenantId, OR: [{ action: { startsWith: "site." } }, { action: { startsWith: "veiculos.config" } }] }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, actorName: true, action: true, createdAt: true } }),
  ]);
  const conta = (o: string) => porOrigem.find((p) => p.origem === o)?._count ?? 0;
  const formularios = { anuncio: conta(ORIGENS_DO_SITE.anuncio), financiamento: conta(ORIGENS_DO_SITE.financiamento), vendaSeuCarro: conta(ORIGENS_DO_SITE.vendaSeuCarro) };
  const contatos = formularios.anuncio + formularios.financiamento + formularios.vendaSeuCarro;

  // Destaques que já não estão à venda (vendido, reservado, fora do site) somem sozinhos do site, mas a loja precisa saber.
  const destaquesVivos = cfg?.destaques?.length ? await prisma.veiculo.count({ where: { tenantId, id: { in: cfg.destaques }, naVitrine: true, status: "DISPONIVEL" } }) : 0;
  const atencao: { texto: string; aba?: string }[] = [];
  if (!cfg?.vitrineAtiva) atencao.push({ texto: "O site está desligado: ligue em Configurações para ele aparecer na internet.", aba: "configuracoes" });
  if (cfg && !cfg.logoKey) atencao.push({ texto: "Sem logo: envie a logo da loja em Configurações > Aparência.", aba: "configuracoes" });
  if (!cfg?.whatsapp) atencao.push({ texto: "Sem WhatsApp do site: os botões usam o número geral do Zap.", aba: "configuracoes" });
  if (!banners) atencao.push({ texto: "Nenhum banner no topo da página inicial.", aba: "banners" });
  if (!cfg?.destaques?.length) atencao.push({ texto: "Nenhum carro em destaque na página inicial.", aba: "destaques" });
  else if (destaquesVivos < cfg.destaques.length) atencao.push({ texto: `${cfg.destaques.length - destaquesVivos} carro(s) em destaque já não estão à venda: troque por outros.`, aba: "destaques" });
  if (semFoto) atencao.push({ texto: `${semFoto} carro(s) à venda sem foto.` });
  if (semPreco) atencao.push({ texto: `${semPreco} carro(s) à venda sem preço (aparecem como "consulte").` });
  if (!cfg?.quemSomosTexto) atencao.push({ texto: 'A página "Quem somos" está vazia.', aba: "paginas" });

  return {
    site: { noAr: !!cfg?.vitrineAtiva, endereco: linkDaLoja(tenant.slug, cfg?.dominio), dominio: cfg?.dominio ?? null },
    veiculosNoSite: noSite,
    contatos30d: contatos,
    variacao: anteriores ? Math.round(((contatos - anteriores) / anteriores) * 100) : null,
    formularios,
    atencao,
    alteracoes: alteracoes.map((a) => ({ id: a.id, quem: a.actorName, oQue: ROTULO_ACAO[a.action] ?? a.action, quando: a.createdAt })),
  };
}

/** Os dados das abas Banners, Destaques e Páginas, e os carros à venda para escolher. */
export async function dadosDoSite(tenantId: string) {
  const [cfg, banners, carros] = await Promise.all([
    prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { destaques: true, ofertaVeiculoId: true, quemSomosTitulo: true, quemSomosTexto: true, instagram: true, facebook: true, sobre: true, siteOrigemUrl: true } }),
    prisma.bannerVitrine.findMany({ where: { tenantId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true, titulo: true, link: true, ativo: true, chaveCelular: true } }),
    prisma.veiculo.findMany({
      where: { tenantId, naVitrine: true, status: "DISPONIVEL" },
      orderBy: { entradaEm: "desc" },
      select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true, fotos: { orderBy: { ordem: "asc" }, take: 1, select: { id: true } } },
    }),
  ]);
  return {
    destaques: cfg?.destaques ?? [],
    ofertaVeiculoId: cfg?.ofertaVeiculoId ?? null,
    quemSomosTitulo: cfg?.quemSomosTitulo ?? "",
    quemSomosTexto: cfg?.quemSomosTexto ?? "",
    sobre: cfg?.sobre ?? "",
    instagram: cfg?.instagram ?? "",
    facebook: cfg?.facebook ?? "",
    siteAtual: cfg?.siteOrigemUrl ?? "",
    banners: banners.map((b) => ({ id: b.id, titulo: b.titulo, link: b.link, ativo: b.ativo, temCelular: !!b.chaveCelular })),
    carros: carros.map((c) => ({ id: c.id, nome: nomeDoVeiculo(c), precoCents: c.precoCents, capaId: c.fotos[0]?.id ?? null })),
  };
}

/** Destaques (até 8, na ordem) e a oferta: só carros da loja; o resto é ignorado. */
export async function salvarDestaques(tenantId: string, ids: string[], ofertaVeiculoId: string | null | undefined) {
  const unicos = [...new Set(ids)].slice(0, MAX_DESTAQUES);
  const validos = new Set((await prisma.veiculo.findMany({ where: { tenantId, id: { in: [...unicos, ...(ofertaVeiculoId ? [ofertaVeiculoId] : [])] } }, select: { id: true } })).map((v) => v.id));
  const data: { destaques: string[]; ofertaVeiculoId?: string | null } = { destaques: unicos.filter((id) => validos.has(id)) };
  if (ofertaVeiculoId !== undefined) data.ofertaVeiculoId = ofertaVeiculoId && validos.has(ofertaVeiculoId) ? ofertaVeiculoId : null;
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return data;
}

export async function salvarPaginas(tenantId: string, d: { quemSomosTitulo?: string | null; quemSomosTexto?: string | null; instagram?: string | null; facebook?: string | null }) {
  const limpo = (v: string | null | undefined, max: number) => (v === undefined ? undefined : (v ?? "").trim().slice(0, max) || null);
  const data = { quemSomosTitulo: limpo(d.quemSomosTitulo, 200), quemSomosTexto: limpo(d.quemSomosTexto, 6000), instagram: limpo(d.instagram, 100), facebook: limpo(d.facebook, 150) };
  const semIndefinidos = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, ...semIndefinidos }, update: semIndefinidos });
}

export type ArquivoDeBanner = { tipo: string; tamanho: number; bytes: () => Promise<Buffer> };

function conferirImagem(a: ArquivoDeBanner, nome: string): string | null {
  if (!TIPOS.includes(a.tipo)) return `${nome}: use PNG, JPG ou WEBP`;
  if (a.tamanho > LIMITE_BANNER) return `${nome}: a imagem passa de 6MB`;
  return null;
}

async function subir(tenantId: string, a: ArquivoDeBanner, lado: "desktop" | "celular", subirArquivo = uploadMedia) {
  const ext = a.tipo.split("/")[1].replace("jpeg", "jpg");
  const key = `${tenantId}/vitrine/banners/${randomUUID().slice(0, 12)}-${lado}.${ext}`;
  await subirArquivo(key, await a.bytes(), a.tipo);
  return key;
}

export async function criarBanner(tenantId: string, d: { desktop: ArquivoDeBanner; celular?: ArquivoDeBanner | null; titulo?: string | null; link?: string | null }, subirArquivo = uploadMedia): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if ((await prisma.bannerVitrine.count({ where: { tenantId } })) >= MAX_BANNERS) return { ok: false, erro: `no máximo ${MAX_BANNERS} banners` };
  const erro = conferirImagem(d.desktop, "Imagem do computador") ?? (d.celular ? conferirImagem(d.celular, "Imagem do celular") : null);
  if (erro) return { ok: false, erro };
  if (d.link && !linkDeBanner(d.link)) return { ok: false, erro: 'link inválido: use uma página do site (começando com "/") ou um endereço https' };
  const chaveDesktop = await subir(tenantId, d.desktop, "desktop", subirArquivo);
  const chaveCelular = d.celular ? await subir(tenantId, d.celular, "celular", subirArquivo) : null;
  const ultima = await prisma.bannerVitrine.findFirst({ where: { tenantId }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const b = await prisma.bannerVitrine.create({ data: { tenantId, chaveDesktop, chaveCelular, titulo: d.titulo?.trim().slice(0, 120) || null, link: linkDeBanner(d.link), ordem: (ultima?.ordem ?? -1) + 1 } });
  return { ok: true, id: b.id };
}

export async function editarBanner(tenantId: string, id: string, d: { titulo?: string | null; link?: string | null; ativo?: boolean; mover?: "cima" | "baixo" }): Promise<{ ok: boolean; erro?: string }> {
  const b = await prisma.bannerVitrine.findFirst({ where: { id, tenantId } });
  if (!b) return { ok: false, erro: "banner não encontrado" };
  if (d.link && !linkDeBanner(d.link)) return { ok: false, erro: 'link inválido: use uma página do site (começando com "/") ou um endereço https' };
  if (d.mover) {
    // Troca a posição com o vizinho, renumerando a lista toda (as ordens ficam 0, 1, 2…).
    const todos = await prisma.bannerVitrine.findMany({ where: { tenantId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const i = todos.findIndex((x) => x.id === id);
    const j = d.mover === "cima" ? i - 1 : i + 1;
    if (j >= 0 && j < todos.length) [todos[i], todos[j]] = [todos[j], todos[i]];
    await prisma.$transaction(todos.map((x, n) => prisma.bannerVitrine.update({ where: { id: x.id }, data: { ordem: n } })));
  }
  await prisma.bannerVitrine.update({
    where: { id },
    data: { ...(d.titulo !== undefined ? { titulo: d.titulo?.trim().slice(0, 120) || null } : {}), ...(d.link !== undefined ? { link: linkDeBanner(d.link) } : {}), ...(d.ativo !== undefined ? { ativo: d.ativo } : {}) },
  });
  return { ok: true };
}

export async function excluirBanner(tenantId: string, id: string, apagar = deleteMedia): Promise<boolean> {
  const b = await prisma.bannerVitrine.findFirst({ where: { id, tenantId } });
  if (!b) return false;
  await prisma.bannerVitrine.delete({ where: { id } });
  for (const k of [b.chaveDesktop, b.chaveCelular]) if (k) await apagar(k).catch(() => {});
  return true;
}

// ---- lado público ----

/** Os banners no ar da loja, na ordem. */
export async function bannersDaLoja(tenantId: string) {
  return prisma.bannerVitrine.findMany({ where: { tenantId, ativo: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true, titulo: true, link: true, chaveCelular: true } });
}

/** A imagem de um banner (só banner ativo de loja com o site no ar). */
export async function imagemDoBanner(tenantId: string, id: string, celular: boolean): Promise<string | null> {
  const b = await prisma.bannerVitrine.findFirst({ where: { id, tenantId, ativo: true }, select: { chaveDesktop: true, chaveCelular: true } });
  if (!b) return null;
  return celular && b.chaveCelular ? b.chaveCelular : b.chaveDesktop;
}

/** Os carros em destaque que ainda estão à venda, na ordem escolhida; o resto da lista cai fora sozinho. */
export function carrosEmDestaque<T extends { id: string }>(ids: string[], carros: T[]): T[] {
  const porId = new Map(carros.map((c) => [c.id, c]));
  return ids.map((id) => porId.get(id)).filter((c): c is T => !!c);
}
