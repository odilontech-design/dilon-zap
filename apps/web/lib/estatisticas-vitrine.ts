import { prisma } from "@dilon-zap/db";

/**
 * Contagem de visitas, cliques no WhatsApp e formulários do site da loja, por dia e por carro
 * (`EstatisticaVitrine`). Só números: nada do visitante (IP, aparelho) é guardado. Robôs de busca
 * não contam, e a mesma página aberta de novo na mesma sessão do navegador também não (o site
 * só manda a visita uma vez por sessão).
 */

export type TipoDeEvento = "visita" | "whatsapp" | "formulario";

const COLUNA: Record<TipoDeEvento, "visitas" | "whatsapp" | "formularios"> = { visita: "visitas", whatsapp: "whatsapp", formulario: "formularios" };

/** O dia no fuso de Brasília (as lojas fecham o dia no horário delas). */
export function diaDeBrasilia(agora = new Date()): Date {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function ehRobo(userAgent: string | null | undefined): boolean {
  return !userAgent || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|monitor|curl|wget|python|java\//i.test(userAgent);
}

export async function registrarEventoDoSite(tenantId: string, veiculoId: string | null, tipo: TipoDeEvento, agora = new Date()) {
  const dia = diaDeBrasilia(agora);
  const coluna = COLUNA[tipo];
  const id = veiculoId ?? "";
  // Carro de outra loja não conta (o id vem do navegador).
  if (id && !(await prisma.veiculo.count({ where: { id, tenantId } }))) return;
  await prisma.estatisticaVitrine.upsert({
    where: { tenantId_dia_veiculoId: { tenantId, dia, veiculoId: id } },
    create: { tenantId, dia, veiculoId: id, [coluna]: 1 },
    update: { [coluna]: { increment: 1 } },
  });
}
