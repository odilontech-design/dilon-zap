import { prisma } from "@dilon-zap/db";

/**
 * Origem da negociação como LISTA, e não texto livre (Believe, 23/10): com
 * texto livre cada um escrevia de um jeito ("insta", "Instagram ",
 * "INSTAGRAM") e o relatório de origem virava uma lista de grafias. As
 * sugestões de partida mais as que a empresa já usa; quem precisa de uma nova
 * adiciona na hora, e ela passa a aparecer para todos.
 */
export const ORIGENS_PADRAO = ["Instagram", "WhatsApp", "Indicação", "Site", "Anúncio", "Evento"];

/** "WHATSAPP", "whatsapp " e "WhatsApp" são a mesma origem. */
export function chaveDaOrigem(o: string) {
  return o.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export async function origensDoTenant(tenantId: string): Promise<string[]> {
  const usadas = await prisma.negociacao.findMany({
    where: { tenantId, origem: { not: null } },
    distinct: ["origem"],
    select: { origem: true },
  });
  const porChave = new Map<string, string>();
  for (const o of ORIGENS_PADRAO) porChave.set(chaveDaOrigem(o), o);
  for (const { origem } of usadas) {
    const k = chaveDaOrigem(origem!);
    if (k && !porChave.has(k)) porChave.set(k, origem!.trim());
  }
  return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Grava a origem na grafia que a lista já usa, se houver uma equivalente. */
export async function origemCanonica(tenantId: string, origem: string | null | undefined): Promise<string | null> {
  const limpa = origem?.trim();
  if (!limpa) return null;
  const lista = await origensDoTenant(tenantId);
  return lista.find((o) => chaveDaOrigem(o) === chaveDaOrigem(limpa)) ?? limpa;
}

/** Empresa que exige responsável, valor e origem em toda negociação nova. */
export async function exigeNegociacaoCompleta(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { negociacaoCompleta: true } });
  return !!t?.negociacaoCompleta;
}

/**
 * Nas empresas com negociação completa, o valor só passa a ser exigido a
 * partir da etapa "Orçamento enviado" (a primeira do funil cujo nome tem
 * "orçamento") e das seguintes. Abrir e conversar não pedem nada.
 */
export async function exigeValorNaEtapa(stageId: string, valorCents: number | null | undefined): Promise<string | null> {
  if (valorCents && valorCents > 0) return null;
  const etapa = await prisma.stage.findUnique({
    where: { id: stageId },
    select: { name: true, position: true, funilId: true, tenant: { select: { negociacaoCompleta: true } } },
  });
  if (!etapa?.funilId || !etapa.tenant.negociacaoCompleta) return null;
  const etapas = await prisma.stage.findMany({ where: { funilId: etapa.funilId }, orderBy: { position: "asc" }, select: { name: true, position: true } });
  const marco = etapas.find((e) => /or[cç]amento/i.test(e.name));
  if (!marco || etapa.position < marco.position) return null;
  return `Informe o valor para levar a negociação a "${etapa.name}".`;
}

/** O que falta para uma negociação nova valer, nas empresas que exigem. Vazio = ok. */
export function faltandoNaNegociacao(d: { responsavelId?: string | null; valorCents?: number | null; origem?: string | null }): string[] {
  const falta: string[] = [];
  if (!d.responsavelId) falta.push("responsável");
  if (!d.valorCents || d.valorCents <= 0) falta.push("valor");
  if (!d.origem?.trim()) falta.push("origem");
  return falta;
}
