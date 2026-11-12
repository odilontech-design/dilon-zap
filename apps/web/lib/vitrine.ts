import { prisma, type Prisma } from "@dilon-zap/db";
import { recursosDoTenant } from "@/lib/plano";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";

/**
 * Vitrine pública da revenda: /loja/[slug] e /loja/[slug]/[veiculoId].
 *
 * Público é público: sem login, indexável, com o link circulando no WhatsApp
 * e no Instagram da loja. Por isso a regra é estreita:
 *
 *   - a loja precisa ter o recurso VEICULOS e ter LIGADO a vitrine;
 *   - só aparece carro disponível (ou reservado, se a loja quiser) e com
 *     `naVitrine`;
 *   - nunca sai custo, piso, placa inteira, chassi, Renavam, observação
 *     interna nem nada do consignante. A seleção abaixo é a lista do que
 *     PODE sair, e não "tudo menos isto": campo novo no Veiculo não vaza
 *     para a internet por esquecimento.
 */

export async function configDaRevenda(tenantId: string) {
  return prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
}

/** Endereço público do site (sem barra no fim). */
export function baseDoSite(): string {
  return (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
}

/**
 * Endereço público da loja: o domínio próprio, se ela tem, ou o do Zap. No
 * domínio próprio a raiz já é a vitrine (o middleware reescreve "/" para
 * /loja/[slug]); os demais caminhos continuam /loja/[slug]/… nos dois.
 */
export function baseDaLoja(dominio: string | null | undefined): string {
  return dominio ? `https://${dominio}` : baseDoSite();
}

export function linkDaLoja(slug: string, dominio?: string | null): string {
  return dominio ? `https://${dominio}` : `${baseDoSite()}/loja/${slug}`;
}

export function linkDoCarro(slug: string, veiculoId: string, dominio?: string | null): string {
  return `${baseDaLoja(dominio)}/loja/${slug}/${veiculoId}`;
}

/**
 * "https://WWW.Sales.com.br/estoque" → "www.sales.com.br". Null se não for um
 * domínio válido (precisa de ponto, só letras, números e hífen por parte).
 */
export function normalizarDominio(texto: string | null | undefined): string | null {
  const d = (texto ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!d || d.length > 253) return null;
  const partes = d.split(".");
  if (partes.length < 2) return null;
  if (!partes.every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))) return null;
  if (!/^[a-z]{2,}$/.test(partes[partes.length - 1])) return null;
  return d;
}

/** O slug da loja dona do domínio, se a vitrine dela está no ar. É o que o middleware e o Caddy consultam. */
export async function slugPorDominio(host: string): Promise<string | null> {
  const dominio = normalizarDominio(host);
  if (!dominio) return null;
  const cfg = await prisma.veiculosConfig.findFirst({
    where: { dominio, vitrineAtiva: true },
    select: { tenant: { select: { slug: true, id: true } } },
  });
  if (!cfg) return null;
  if (!(await recursosDoTenant(cfg.tenant.id)).has("VEICULOS")) return null;
  return cfg.tenant.slug;
}

/** Só dígitos; número brasileiro sem DDI ganha o 55. */
export function normalizarWhatsapp(numero: string | null | undefined): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * A mensagem que o visitante manda ao clicar em "Tenho interesse". Leva o
 * link do carro: no Inbox, o vendedor sabe na hora de qual carro se trata,
 * sem perguntar "qual anúncio você viu?".
 */
export function mensagemDeInteresse(v: Parameters<typeof nomeDoVeiculo>[0], link: string): string {
  return `Olá! Tenho interesse no ${nomeDoVeiculo(v)} que vi no site: ${link}`;
}

/** O que pode ir para a internet. Ver o comentário do topo. */
export const SELECT_PUBLICO = {
  id: true,
  tipo: true,
  marca: true,
  modelo: true,
  versao: true,
  anoFabricacao: true,
  anoModelo: true,
  km: true,
  cor: true,
  combustivel: true,
  cambio: true,
  portas: true,
  opcionais: true,
  precoCents: true,
  descricao: true,
  status: true,
  entradaEm: true,
  fotos: { orderBy: { ordem: "asc" }, select: { id: true } },
} satisfies Prisma.VeiculoSelect;

export type CarroPublico = Prisma.VeiculoGetPayload<{ select: typeof SELECT_PUBLICO }>;

export type LojaPublica = {
  tenantId: string;
  slug: string;
  dominio: string | null;
  metaPixelId: string | null;
  ga4Id: string | null;
  formularioAtivo: boolean;
  nome: string;
  endereco: string | null;
  sobre: string | null;
  whatsapp: string | null;
  mostrarReservados: boolean;
};

/** A loja pelo slug, ou null se não existe, não tem o recurso ou não ligou a vitrine. */
export async function lojaPublica(slug: string): Promise<LojaPublica | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, veiculosConfig: true },
  });
  const cfg = tenant?.veiculosConfig;
  if (!tenant || !cfg?.vitrineAtiva) return null;
  if (!(await recursosDoTenant(tenant.id)).has("VEICULOS")) return null;

  let whatsapp = normalizarWhatsapp(cfg.whatsapp);
  if (!whatsapp) {
    const n = await numeroGeral(tenant.id);
    whatsapp = normalizarWhatsapp(n?.phoneNumber);
  }
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    dominio: cfg.dominio,
    metaPixelId: cfg.metaPixelId,
    ga4Id: cfg.ga4Id,
    formularioAtivo: cfg.formularioAtivo,
    nome: cfg.nomeLoja?.trim() || tenant.name,
    endereco: cfg.endereco,
    sobre: cfg.sobre,
    whatsapp,
    mostrarReservados: cfg.mostrarReservados,
  };
}

function ondePublico(loja: LojaPublica): Prisma.VeiculoWhereInput {
  return {
    tenantId: loja.tenantId,
    naVitrine: true,
    status: { in: loja.mostrarReservados ? ["DISPONIVEL", "RESERVADO"] : ["DISPONIVEL"] },
  };
}

export async function carrosDaVitrine(loja: LojaPublica): Promise<CarroPublico[]> {
  return prisma.veiculo.findMany({
    where: ondePublico(loja),
    // Disponível antes de reservado; dentro de cada um, o que chegou por último primeiro.
    orderBy: [{ status: "asc" }, { entradaEm: "desc" }],
    take: 500,
    select: SELECT_PUBLICO,
  });
}

export async function carroDaVitrine(loja: LojaPublica, id: string): Promise<CarroPublico | null> {
  return prisma.veiculo.findFirst({ where: { ...ondePublico(loja), id }, select: SELECT_PUBLICO });
}

/** A foto, se ela é de um carro que a vitrine mostra. */
export async function fotoDaVitrine(loja: LojaPublica, fotoId: string) {
  return prisma.fotoVeiculo.findFirst({
    where: { id: fotoId, tenantId: loja.tenantId, veiculo: ondePublico(loja) },
    select: { key: true },
  });
}

/** Link do carro na vitrine para mandar junto da ficha no WhatsApp, quando ele aparece lá. */
export async function linkPublicoDoCarro(tenantId: string, veiculo: { id: string; naVitrine: boolean; status: string }): Promise<string | null> {
  if (!veiculo.naVitrine || (veiculo.status !== "DISPONIVEL" && veiculo.status !== "RESERVADO")) return null;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, veiculosConfig: { select: { vitrineAtiva: true, mostrarReservados: true, dominio: true } } } });
  if (!t?.veiculosConfig?.vitrineAtiva || (!baseDoSite() && !t.veiculosConfig.dominio)) return null;
  if (veiculo.status === "RESERVADO" && !t.veiculosConfig.mostrarReservados) return null;
  return linkDoCarro(t.slug, veiculo.id, t.veiculosConfig.dominio);
}
