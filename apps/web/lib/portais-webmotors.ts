import { prisma } from "@dilon-zap/db";
import { chaveDoAmbiente, cifrar, credenciaisDaConta, SessaoWebmotors, type CredenciaisWebmotors, type Modalidade } from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";

/**
 * Lado do painel da Webmotors. A conta é por CNPJ + e-mail + senha do sistema
 * de revendedores (não há OAuth): guardamos o trio cifrado (AES-256-GCM) e o
 * worker dos portais usa para autenticar. O envio é do worker.
 */

export const integracaoWebmotorsConfigurada = () => !!segredoDosPortais();

export const soDigitosCnpj = (s: string) => s.replace(/\D/g, "");

/** Confere o login na Webmotors e guarda a conta. Devolve os planos de anúncio do pacote da loja. */
export async function conectarWebmotors(tenantId: string, cred: CredenciaisWebmotors): Promise<{ ok: true; modalidades: Modalidade[] } | { ok: false; erro: string }> {
  const segredo = segredoDosPortais();
  if (!segredo) return { ok: false, erro: "integração com os portais ainda não configurada no servidor" };
  const c = { cnpj: soDigitosCnpj(cred.cnpj), email: cred.email.trim(), senha: cred.senha };
  const sessao = new SessaoWebmotors(c);
  let modalidades: Modalidade[];
  try {
    await sessao.autenticar();
    modalidades = await sessao.modalidades();
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "não foi possível entrar na Webmotors" };
  }
  const guardado = cifrar(JSON.stringify(c), chaveDoAmbiente(segredo));
  const unica = modalidades.length === 1 ? modalidades[0].codigo : undefined;
  await prisma.portalConta.upsert({
    where: { tenantId_portal: { tenantId, portal: "WEBMOTORS" } },
    create: { tenantId, portal: "WEBMOTORS", accessTokenCripto: guardado, status: "CONECTADA", contaEmail: c.email, contaNome: c.cnpj, planoPadrao: unica },
    update: { accessTokenCripto: guardado, status: "CONECTADA", contaEmail: c.email, contaNome: c.cnpj, erro: null, conectadaEm: new Date(), ...(unica ? { planoPadrao: unica } : {}) },
  });
  return { ok: true, modalidades };
}

export async function desconectarWebmotors(tenantId: string) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "WEBMOTORS" }, data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null } });
}

/** Os planos de anúncio da loja, consultados ao vivo (a Webmotors é quem sabe quantos cabem). */
export async function modalidadesWebmotors(tenantId: string): Promise<Modalidade[] | null> {
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "WEBMOTORS" } } });
  if (!segredo || !conta || conta.status === "DESCONECTADA" || !conta.accessTokenCripto) return null;
  return new SessaoWebmotors(credenciaisDaConta(conta.accessTokenCripto, chaveDoAmbiente(segredo))).modalidades();
}

export async function definirPlanoPadrao(tenantId: string, codigo: string | null) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "WEBMOTORS" }, data: { planoPadrao: codigo } });
}

/** Liga o anúncio na Webmotors. Sem km informada o worker não publica: mostra o que falta. */
export async function anunciarNaWebmotors(tenantId: string, veiculoIds: string[]): Promise<{ ligados: number; semKm: number }> {
  const carros = await prisma.veiculo.findMany({ where: { tenantId, id: { in: veiculoIds } }, select: { id: true, kmInformado: true } });
  let semKm = 0;
  for (const c of carros) {
    if (c.kmInformado === false) semKm++;
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: c.id, portal: "WEBMOTORS" } },
      create: { tenantId, veiculoId: c.id, portal: "WEBMOTORS", idEnviado: c.id.slice(-12) },
      update: { ativo: true, erro: null, proximaTentativaEm: null },
    });
  }
  return { ligados: carros.length, semKm };
}

export async function desligarDaWebmotors(tenantId: string, veiculoId: string) {
  await prisma.publicacaoPortal.updateMany({ where: { tenantId, veiculoId, portal: "WEBMOTORS" }, data: { ativo: false, proximaTentativaEm: null } });
}

/** Resumo para o painel: conta, plano padrão, contagem por status e o que está com problema. */
export async function painelWebmotors(tenantId: string) {
  const [conta, porStatus, problemas, semKm] = await Promise.all([
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "WEBMOTORS" } }, select: { status: true, contaEmail: true, contaNome: true, erro: true, planoPadrao: true, conectadaEm: true } }),
    prisma.publicacaoPortal.groupBy({ by: ["status"], where: { tenantId, portal: "WEBMOTORS", ativo: true }, _count: true }),
    prisma.publicacaoPortal.findMany({
      where: { tenantId, portal: "WEBMOTORS", ativo: true, erro: { not: null }, veiculo: { status: "DISPONIVEL" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, veiculoId: true, status: true, erro: true, veiculo: { select: { marca: true, modelo: true, versao: true, anoModelo: true, placa: true } } },
    }),
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL", kmInformado: false } }),
  ]);
  return { configurada: integracaoWebmotorsConfigurada(), conta, contagem: Object.fromEntries(porStatus.map((s) => [s.status, s._count])) as Record<string, number>, problemas, semKm };
}
