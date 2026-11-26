import { prisma } from "@dilon-zap/db";
import {
  SessaoMercadoLivre,
  appMercadoLivreDoAmbiente,
  assinarEstado,
  chaveDoAmbiente,
  contaMercadoLivreGuardada,
  guardarContaMercadoLivre,
  lerEstado,
  trocarCodigoMercadoLivre,
  urlDeAutorizacaoMercadoLivre,
  type ContaMercadoLivre,
} from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";

/**
 * Lado do painel do Mercado Livre (anúncios classificados de veículos). O lojista autoriza o Zap
 * por OAuth com a conta dele no Mercado Livre; guardamos o vendedor e os tokens cifrados em
 * `PortalConta` (PORTAIS_CHAVE). O envio dos anúncios é do worker dos portais. A loja precisa ter
 * um pacote de publicação de veículos contratado com o comercial do Mercado Livre (não há como
 * contratar por API). Variáveis: MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET (o app da
 * Dilon Tech no DevCenter). URL de retorno: `<NEXTAUTH_URL>/api/portais/mercadolivre/retorno`.
 */

export const integracaoMercadoLivreConfigurada = () => !!(appMercadoLivreDoAmbiente() && segredoDosPortais());

export function urlDeConexaoMercadoLivre(tenantId: string, userId: string, urlBase: string): string | null {
  const app = appMercadoLivreDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return null;
  return urlDeAutorizacaoMercadoLivre(app, assinarEstado({ tenantId, userId, portal: "MERCADO_LIVRE" }, segredo));
}

/** O retorno do OAuth: troca o código pelos tokens, descobre a conta e guarda. */
export async function concluirConexaoMercadoLivre(code: string, state: string, urlBase: string, esperado: { tenantId: string; userId: string }): Promise<{ ok: true } | { ok: false; motivo: "invalida" | "falhou" | "nao-configurada"; erro?: string }> {
  const app = appMercadoLivreDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return { ok: false, motivo: "nao-configurada" };
  const estado = lerEstado(state, segredo);
  if (!estado || estado.portal !== "MERCADO_LIVRE" || estado.tenantId !== esperado.tenantId || estado.userId !== esperado.userId) return { ok: false, motivo: "invalida" };
  try {
    const t = await trocarCodigoMercadoLivre(app, code);
    const eu = await new SessaoMercadoLivre(t, t.userId ?? "", app).eu();
    const conta: ContaMercadoLivre = { vendedorId: eu.id, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm };
    const dados = { accessTokenCripto: guardarContaMercadoLivre(conta, chaveDoAmbiente(segredo)), status: "CONECTADA" as const, contaNome: eu.apelido, contaEmail: eu.email, erro: null, conectadaEm: new Date() };
    await prisma.portalConta.upsert({ where: { tenantId_portal: { tenantId: esperado.tenantId, portal: "MERCADO_LIVRE" } }, create: { tenantId: esperado.tenantId, portal: "MERCADO_LIVRE", ...dados }, update: dados });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "falhou", erro: e instanceof Error ? e.message : undefined };
  }
}

export async function desconectarMercadoLivre(tenantId: string) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "MERCADO_LIVRE" }, data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null } });
}

/** Uma sessão da loja com o Mercado Livre (renova o token e guarda o novo: o refresh token é de uso único). */
async function sessaoDaLoja(tenantId: string): Promise<SessaoMercadoLivre | null> {
  const app = appMercadoLivreDoAmbiente();
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "MERCADO_LIVRE" } } });
  if (!app || !segredo || !conta || conta.status === "DESCONECTADA" || !conta.accessTokenCripto) return null;
  const chave = chaveDoAmbiente(segredo);
  const g = contaMercadoLivreGuardada(conta.accessTokenCripto, chave);
  return new SessaoMercadoLivre({ access: g.access, refresh: g.refresh, expiraEm: g.expiraEm }, g.vendedorId, app, async (t) => {
    g.access = t.access;
    g.refresh = t.refresh;
    g.expiraEm = t.expiraEm;
    await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaMercadoLivre(g, chave) } });
  });
}

export async function anunciarNoMercadoLivre(tenantId: string, veiculoIds: string[]): Promise<{ ligados: number; semKm: number }> {
  const carros = await prisma.veiculo.findMany({ where: { tenantId, id: { in: veiculoIds } }, select: { id: true, kmInformado: true } });
  let semKm = 0;
  for (const c of carros) {
    if (c.kmInformado === false) semKm++;
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: c.id, portal: "MERCADO_LIVRE" } },
      create: { tenantId, veiculoId: c.id, portal: "MERCADO_LIVRE", idEnviado: c.id.slice(-12) },
      update: { ativo: true, erro: null, proximaTentativaEm: null },
    });
  }
  return { ligados: carros.length, semKm };
}

export async function desligarDoMercadoLivre(tenantId: string, veiculoId: string) {
  await prisma.publicacaoPortal.updateMany({ where: { tenantId, veiculoId, portal: "MERCADO_LIVRE" }, data: { ativo: false, proximaTentativaEm: null } });
}

export async function painelMercadoLivre(tenantId: string) {
  const [conta, porStatus, problemas, semKm, semChassi] = await Promise.all([
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "MERCADO_LIVRE" } }, select: { status: true, contaNome: true, contaEmail: true, erro: true, conectadaEm: true } }),
    prisma.publicacaoPortal.groupBy({ by: ["status"], where: { tenantId, portal: "MERCADO_LIVRE", ativo: true }, _count: true }),
    prisma.publicacaoPortal.findMany({
      where: { tenantId, portal: "MERCADO_LIVRE", ativo: true, erro: { not: null }, veiculo: { status: "DISPONIVEL" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, veiculoId: true, status: true, erro: true, veiculo: { select: { marca: true, modelo: true, versao: true, anoModelo: true, placa: true } } },
    }),
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL", kmInformado: false } }),
    // O Mercado Livre confere o carro pela placa e pelo chassi (6 últimos): sem eles o anúncio não sobe.
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL", OR: [{ chassi: null }, { chassi: "" }, { placa: null }, { placa: "" }] } }),
  ]);
  // As vagas do pacote, ao vivo (se o Mercado Livre não responder, a tela só não mostra).
  let vagas: number | null = null;
  if (conta?.status === "CONECTADA") {
    try {
      vagas = await (await sessaoDaLoja(tenantId))?.vagas() ?? null;
    } catch {
      vagas = null;
    }
  }
  return { configurada: integracaoMercadoLivreConfigurada(), conta, contagem: Object.fromEntries(porStatus.map((s) => [s.status, s._count])) as Record<string, number>, problemas, semKm, semChassi, vagas };
}
