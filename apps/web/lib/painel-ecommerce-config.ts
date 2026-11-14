import { prisma } from "@dilon-zap/db";
import { chaveDoAmbiente, cifrar, decifrar } from "@dilon-zap/portais";
import { urlDoSite } from "./painel-ecommerce";

/**
 * A URL do site e a chave do painel, por empresa. A chave fica cifrada (AES-256-GCM, a mesma PORTAIS_CHAVE dos
 * portais) e só sai do banco aqui, dentro do servidor, na hora de chamar o site: nunca volta para o navegador.
 * Nunca em variável de ambiente global, porque outras empresas podem ter loja depois (pedido da Believe, 13/11).
 */

export class ErroDeConfiguracao extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export async function lerConfigDoPainel(tenantId: string): Promise<{ url: string; chave: string } | null> {
  const c = await prisma.painelEcommerceConfig.findUnique({ where: { tenantId } });
  if (!c) return null;
  try {
    return { url: c.url, chave: decifrar(c.chaveCripto, chaveDoAmbiente()) };
  } catch {
    // Chave do servidor trocada ou registro corrompido: melhor dizer do que cair em erro 500 mudo.
    throw new ErroDeConfiguracao("A chave guardada não pôde ser lida. Cadastre a chave do site de novo.", 500);
  }
}

/** O que a tela do Super Admin pode saber: se está configurada e para onde, nunca a chave. */
export async function resumoDaConfig(tenantId: string) {
  const c = await prisma.painelEcommerceConfig.findUnique({ where: { tenantId }, select: { url: true, testadoEm: true, testeOk: true, atualizadoEm: true } });
  return c ? { configurada: true as const, ...c } : { configurada: false as const };
}

/** Grava a URL e a chave (cifrada). Chave vazia mantém a que já está, para trocar só o endereço. */
export async function salvarConfigDoPainel(tenantId: string, url: string, chave: string | null) {
  const u = urlDoSite(url);
  if (!u.ok) throw new ErroDeConfiguracao(u.erro);
  const existente = await prisma.painelEcommerceConfig.findUnique({ where: { tenantId }, select: { chaveCripto: true } });
  const nova = chave?.trim();
  if (!nova && !existente) throw new ErroDeConfiguracao("Informe a chave do site.");
  const chaveCripto = nova ? cifrar(nova, chaveDoAmbiente()) : existente!.chaveCripto;
  await prisma.painelEcommerceConfig.upsert({
    where: { tenantId },
    create: { tenantId, url: u.base, chaveCripto },
    // Mudou a URL ou a chave: o teste anterior deixou de valer.
    update: { url: u.base, chaveCripto, testadoEm: null, testeOk: null },
  });
  return u.base;
}

export async function registrarTeste(tenantId: string, ok: boolean) {
  await prisma.painelEcommerceConfig.updateMany({ where: { tenantId }, data: { testadoEm: new Date(), testeOk: ok } });
}

export async function removerConfigDoPainel(tenantId: string) {
  await prisma.painelEcommerceConfig.deleteMany({ where: { tenantId } });
}
