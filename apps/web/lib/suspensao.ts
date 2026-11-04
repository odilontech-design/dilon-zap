import { prisma } from "@dilon-zap/db";

/**
 * Empresa com acesso suspenso por falta de pagamento (Tenant.suspensoEm).
 *
 * requireUser consulta isto em toda requisição da área logada, e o menu faz
 * polling — então a resposta fica alguns segundos em memória. Quem suspende
 * ou reativa chama `esquecerSuspensao`, e o efeito é imediato neste processo.
 */
const VALIDADE_MS = 10_000;
const cache = new Map<string, { suspensa: boolean; ate: number }>();

export async function empresaSuspensa(tenantId: string): Promise<boolean> {
  const agora = Date.now();
  const guardado = cache.get(tenantId);
  if (guardado && guardado.ate > agora) return guardado.suspensa;

  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { suspensoEm: true } });
  const suspensa = !!t?.suspensoEm;
  cache.set(tenantId, { suspensa, ate: agora + VALIDADE_MS });
  return suspensa;
}

export function esquecerSuspensao(tenantId: string) {
  cache.delete(tenantId);
}
