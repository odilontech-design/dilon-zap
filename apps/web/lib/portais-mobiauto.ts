import { prisma } from "@dilon-zap/db";
import {
  SessaoMobiauto,
  appMobiautoDoAmbiente,
  assinarEstado,
  chaveDoAmbiente,
  contaMobiautoGuardada,
  guardarContaMobiauto,
  lerEstado,
  trocarCodigoMobiauto,
  urlDeAutorizacaoMobiauto,
  type ContaMobiauto,
  type PlanoMobi,
} from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";

/**
 * Lado do painel da MobiAuto (Mobigestor). A loja autoriza o Zap por OAuth; guardamos a loja
 * (dealer) e os tokens cifrados em `PortalConta` (chave PORTAIS_CHAVE). O envio é do worker
 * dos portais. Variáveis: MOBIAUTO_CLIENT_ID e MOBIAUTO_CLIENT_SECRET (o app que a MobiAuto
 * libera para a Dilon Tech) e a URL de retorno `<NEXTAUTH_URL>/api/portais/mobiauto/retorno`.
 */

export const integracaoMobiautoConfigurada = () => !!(appMobiautoDoAmbiente() && segredoDosPortais());

export function urlDeConexaoMobiauto(tenantId: string, userId: string, urlBase: string): string | null {
  const app = appMobiautoDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return null;
  return urlDeAutorizacaoMobiauto(app, assinarEstado({ tenantId, userId, portal: "MOBIAUTO" }, segredo));
}

/** O retorno do OAuth: troca o código pelos tokens, descobre a loja e guarda a conta. */
export async function concluirConexaoMobiauto(code: string, state: string, urlBase: string, esperado: { tenantId: string; userId: string }): Promise<{ ok: true } | { ok: false; motivo: "invalida" | "falhou" | "nao-configurada" | "sem-loja"; erro?: string }> {
  const app = appMobiautoDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return { ok: false, motivo: "nao-configurada" };
  const estado = lerEstado(state, segredo);
  if (!estado || estado.portal !== "MOBIAUTO" || estado.tenantId !== esperado.tenantId || estado.userId !== esperado.userId) return { ok: false, motivo: "invalida" };
  try {
    const t = await trocarCodigoMobiauto(app, code);
    // A loja: a única que o usuário gerencia, ou a primeira (a gestão troca no painel se houver várias).
    const lojas = await new SessaoMobiauto(t, "0", app).lojas();
    if (!lojas.length) return { ok: false, motivo: "sem-loja" };
    const conta: ContaMobiauto = { dealerId: lojas[0].id, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm };
    const dados = { accessTokenCripto: guardarContaMobiauto(conta, chaveDoAmbiente(segredo)), status: "CONECTADA" as const, contaNome: lojas[0].nome, contaEmail: lojas[0].cnpj || null, erro: null, conectadaEm: new Date() };
    await prisma.portalConta.upsert({ where: { tenantId_portal: { tenantId: esperado.tenantId, portal: "MOBIAUTO" } }, create: { tenantId: esperado.tenantId, portal: "MOBIAUTO", ...dados }, update: dados });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "falhou", erro: e instanceof Error ? e.message : undefined };
  }
}

export async function desconectarMobiauto(tenantId: string) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "MOBIAUTO" }, data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null } });
}

/** Uma sessão da loja com a MobiAuto (renova o token e guarda o novo). */
async function sessaoDaLoja(tenantId: string): Promise<{ sessao: SessaoMobiauto; contaId: string } | null> {
  const app = appMobiautoDoAmbiente();
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "MOBIAUTO" } } });
  if (!app || !segredo || !conta || conta.status === "DESCONECTADA" || !conta.accessTokenCripto) return null;
  const chave = chaveDoAmbiente(segredo);
  const g = contaMobiautoGuardada(conta.accessTokenCripto, chave);
  const sessao = new SessaoMobiauto({ access: g.access, refresh: g.refresh, expiraEm: g.expiraEm }, g.dealerId, app, async (t) => {
    await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaMobiauto({ ...g, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm }, chave) } });
  });
  return { sessao, contaId: conta.id };
}

export async function planosMobiauto(tenantId: string): Promise<PlanoMobi[] | null> {
  const s = await sessaoDaLoja(tenantId);
  return s ? s.sessao.planos() : null;
}

export async function lojasMobiauto(tenantId: string) {
  const s = await sessaoDaLoja(tenantId);
  return s ? s.sessao.lojas() : null;
}

/** Troca a loja (dealer) da conta, para quem gerencia mais de uma no Mobigestor. */
export async function definirLojaMobiauto(tenantId: string, dealerId: string): Promise<boolean> {
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "MOBIAUTO" } } });
  if (!segredo || !conta?.accessTokenCripto) return false;
  const chave = chaveDoAmbiente(segredo);
  const g = contaMobiautoGuardada(conta.accessTokenCripto, chave);
  await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaMobiauto({ ...g, dealerId }, chave) } });
  return true;
}

export async function definirPlanoMobiauto(tenantId: string, plano: string | null) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "MOBIAUTO" }, data: { planoPadrao: plano } });
}

export async function anunciarNaMobiauto(tenantId: string, veiculoIds: string[]): Promise<{ ligados: number; semKm: number }> {
  const carros = await prisma.veiculo.findMany({ where: { tenantId, id: { in: veiculoIds } }, select: { id: true, kmInformado: true } });
  let semKm = 0;
  for (const c of carros) {
    if (c.kmInformado === false) semKm++;
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: c.id, portal: "MOBIAUTO" } },
      create: { tenantId, veiculoId: c.id, portal: "MOBIAUTO", idEnviado: c.id.slice(-12) },
      update: { ativo: true, erro: null, proximaTentativaEm: null },
    });
  }
  return { ligados: carros.length, semKm };
}

export async function desligarDaMobiauto(tenantId: string, veiculoId: string) {
  await prisma.publicacaoPortal.updateMany({ where: { tenantId, veiculoId, portal: "MOBIAUTO" }, data: { ativo: false, proximaTentativaEm: null } });
}

const placaLimpa = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Ensaio da troca de sistema (só leitura): o que a loja já tem na MobiAuto contra o estoque do Zap, casando pela placa. */
export async function conferirMobiauto(tenantId: string) {
  const s = await sessaoDaLoja(tenantId);
  if (!s) return null;
  const existentes = await s.sessao.estoque();
  const carros = await prisma.veiculo.findMany({ where: { tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select: { id: true, marca: true, modelo: true, anoModelo: true, placa: true } });
  const naMobi = new Map(existentes.map((d) => [d.placa, d]));
  const noZap = new Set(carros.map((c) => placaLimpa(c.placa)).filter(Boolean));
  return {
    naMobiauto: existentes.length,
    noZap: carros.length,
    casam: carros.filter((c) => naMobi.has(placaLimpa(c.placa))).length,
    soNoZap: carros.filter((c) => !naMobi.has(placaLimpa(c.placa))).slice(0, 100).map((c) => ({ id: c.id, nome: `${c.marca} ${c.modelo} ${c.anoModelo}`, placa: c.placa })),
    soNaMobiauto: existentes.filter((d) => !noZap.has(d.placa)).slice(0, 100).map((d) => ({ codigo: String(d.id), placa: d.placa || null })),
  };
}

export async function painelMobiauto(tenantId: string) {
  const [conta, porStatus, problemas, semKm] = await Promise.all([
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "MOBIAUTO" } }, select: { status: true, contaNome: true, contaEmail: true, erro: true, planoPadrao: true, conectadaEm: true } }),
    prisma.publicacaoPortal.groupBy({ by: ["status"], where: { tenantId, portal: "MOBIAUTO", ativo: true }, _count: true }),
    prisma.publicacaoPortal.findMany({
      where: { tenantId, portal: "MOBIAUTO", ativo: true, erro: { not: null }, veiculo: { status: "DISPONIVEL" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, veiculoId: true, status: true, erro: true, veiculo: { select: { marca: true, modelo: true, versao: true, anoModelo: true, placa: true } } },
    }),
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL", kmInformado: false } }),
  ]);
  return { configurada: integracaoMobiautoConfigurada(), conta, contagem: Object.fromEntries(porStatus.map((s) => [s.status, s._count])) as Record<string, number>, problemas, semKm };
}
