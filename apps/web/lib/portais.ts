import { prisma } from "@dilon-zap/db";
import {
  catalogo,
  chaveDoAmbiente,
  credenciaisDoAmbiente,
  decifrar,
  escolhaSegura,
  idParaOlx,
  credencialDoLead,
  novoTokenDeLead,
  registrarEnderecoDeLeads,
  removerEnderecoDeLeads,
  sugerir,
  type CatalogoOlx,
  type OpcaoCatalogo,
} from "@dilon-zap/portais";

/**
 * Lado do painel da integração com os portais: conectar a conta, escolher
 * quais carros vão para o portal, ver o que aconteceu com cada anúncio.
 * O envio em si é do worker dos portais (apps/portais-worker).
 */

/** O segredo que assina o "state" do OAuth e os links das fotos. */
export function segredoDosPortais(): string | null {
  return process.env.PORTAIS_CHAVE || null;
}

export function integracaoOlxConfigurada(): boolean {
  return !!(segredoDosPortais() && credenciaisDoAmbiente());
}

export async function tokenOlx(tenantId: string): Promise<string | null> {
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "OLX" } } });
  if (!conta || conta.status === "DESCONECTADA") return null;
  return decifrar(conta.accessTokenCripto, chaveDoAmbiente());
}

export const STATUS_ROTULO: Record<string, string> = {
  FILA: "Na fila",
  ENVIADO: "Enviado, aguardando a OLX",
  PUBLICADO: "No ar",
  ERRO: "Com problema",
  REMOVENDO: "Saindo do ar",
  REMOVIDO: "Fora do ar",
};

export async function painelPortais(tenantId: string) {
  const [conta, config, porStatus, disponiveis, comAnuncio] = await Promise.all([
    prisma.portalConta.findUnique({
      where: { tenantId_portal: { tenantId, portal: "OLX" } },
      select: { status: true, contaNome: true, contaEmail: true, erro: true, conectadaEm: true, leadConfigId: true, leadErro: true, leadEm: true },
    }),
    prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { cepAnuncios: true, telefoneAnuncios: true, whatsapp: true } }),
    prisma.publicacaoPortal.groupBy({ by: ["status"], where: { tenantId, portal: "OLX", ativo: true }, _count: true }),
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL" } }),
    prisma.publicacaoPortal.count({ where: { tenantId, portal: "OLX", ativo: true, veiculo: { status: "DISPONIVEL" } } }),
  ]);
  const problemas = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "OLX", ativo: true, erro: { not: null }, veiculo: { status: "DISPONIVEL" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, veiculoId: true, status: true, erro: true, veiculo: { select: { marca: true, modelo: true, versao: true, anoModelo: true, placa: true } } },
  });
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const [leadsTotal, leadsRecentes] = await Promise.all([
    prisma.leadPortal.count({ where: { tenantId, portal: "OLX", recebidoEm: { gte: desde } } }),
    prisma.leadPortal.findMany({
      where: { tenantId, portal: "OLX" },
      orderBy: { recebidoEm: "desc" },
      take: 10,
      select: { id: true, origem: true, nome: true, telefone: true, email: true, mensagem: true, semTelefone: true, negociacaoId: true, recebidoEm: true },
    }),
  ]);
  return {
    leads: { total30d: leadsTotal, recentes: leadsRecentes },
    configurada: integracaoOlxConfigurada(),
    conta,
    config: { cep: config?.cepAnuncios ?? null, telefone: config?.telefoneAnuncios ?? null, whatsapp: config?.whatsapp ?? null },
    contagem: Object.fromEntries(porStatus.map((s) => [s.status, s._count])) as Record<string, number>,
    disponiveis,
    semAnuncio: Math.max(0, disponiveis - comAnuncio),
    problemas,
  };
}

/**
 * Liga o anúncio de carros na OLX. Quem ainda não tem catálogo escolhido
 * ganha a sugestão automática quando ela é clara; o resto fica esperando a
 * loja escolher na ficha (o worker mostra o que falta).
 */
export async function anunciarNaOlx(tenantId: string, veiculoIds: string[]): Promise<{ ligados: number; semCatalogo: number }> {
  const carros = await prisma.veiculo.findMany({
    where: { tenantId, id: { in: veiculoIds } },
    select: { id: true, marca: true, modelo: true, versao: true, publicacoes: { where: { portal: "OLX" } } },
  });
  const token = await tokenOlx(tenantId).catch(() => null);
  // Num "anunciar todos", vários carros da mesma marca: cada lista do catálogo é buscada uma vez só.
  const cache = new Map<string, Promise<Record<string, number>>>();
  const buscar = (marca?: string, modelo?: string) => {
    const k = `${marca ?? ""}/${modelo ?? ""}`;
    if (!cache.has(k)) cache.set(k, catalogo(token!, marca, modelo));
    return cache.get(k)!;
  };
  let ligados = 0;
  let semCatalogo = 0;
  for (const c of carros) {
    const atual = c.publicacoes[0];
    let cat = (atual?.catalogo as CatalogoOlx | null) ?? null;
    if (!cat && token) cat = await sugestaoAutomatica(buscar, c).catch(() => null);
    if (!cat) semCatalogo++;
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: c.id, portal: "OLX" } },
      create: { tenantId, veiculoId: c.id, portal: "OLX", idEnviado: idParaOlx(c.id), catalogo: cat ?? undefined },
      update: { ativo: true, ...(cat ? { catalogo: cat } : {}), proximaTentativaEm: null },
    });
    ligados++;
  }
  return { ligados, semCatalogo };
}

export async function desligarDaOlx(tenantId: string, veiculoId: string) {
  await prisma.publicacaoPortal.updateMany({ where: { tenantId, veiculoId, portal: "OLX" }, data: { ativo: false, proximaTentativaEm: null } });
}

/** Marca → modelo → versão, cada passo só quando a melhor opção é clara. */
async function sugestaoAutomatica(
  buscar: (marca?: string, modelo?: string) => Promise<Record<string, number>>,
  c: { marca: string; modelo: string; versao: string | null },
): Promise<CatalogoOlx | null> {
  const marca = escolhaSegura(sugerir(c.marca, await buscar()));
  if (!marca) return null;
  const modelo = escolhaSegura(sugerir(c.modelo, await buscar(marca.id)));
  if (!modelo) return null;
  const versao = escolhaSegura(sugerir(c.versao ?? "", await buscar(marca.id, modelo.id)));
  if (!versao) return null;
  return { marca: marca.id, modelo: modelo.id, versao: versao.id };
}

/** Listas do catálogo com as opções mais prováveis primeiro (para a tela de escolha). */
export async function opcoesDoCatalogo(
  token: string,
  nivel: { marca?: string; modelo?: string },
  procurado: string | null,
): Promise<OpcaoCatalogo[]> {
  const dados = await catalogo(token, nivel.marca, nivel.marca ? nivel.modelo : undefined);
  const sugeridas = procurado ? sugerir(procurado, dados, 5) : [];
  const ids = new Set(sugeridas.map((s) => s.id));
  return [...sugeridas, ...sugerir(null, dados).filter((o) => !ids.has(o.id))];
}

/**
 * Registra na OLX o endereço que recebe os leads desta loja. Cada loja tem o
 * seu (token na URL), gerado na primeira vez e mantido nas seguintes: trocar o
 * endereço a cada reconexão deixaria a OLX entregando para um token morto.
 */
export async function registrarLeadsNaOlx(tenantId: string, urlBase: string): Promise<{ ok: boolean; erro?: string }> {
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "OLX" } } });
  if (!segredo || !conta || conta.status !== "CONECTADA") return { ok: false, erro: "conecte a conta da OLX primeiro" };
  const leadToken = conta.leadToken ?? novoTokenDeLead();
  try {
    const token = decifrar(conta.accessTokenCripto, chaveDoAmbiente());
    const url = `${urlBase.replace(/\/$/, "")}/api/portais/olx/lead/${leadToken}`;
    const configId = await registrarEnderecoDeLeads(token, url, credencialDoLead(leadToken, segredo), conta.leadConfigId);
    await prisma.portalConta.update({ where: { id: conta.id }, data: { leadToken, leadConfigId: configId, leadErro: null, leadEm: new Date() } });
    return { ok: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falha ao registrar o endereço de leads";
    await prisma.portalConta.update({ where: { id: conta.id }, data: { leadToken, leadErro: erro.slice(0, 500) } });
    return { ok: false, erro };
  }
}

/** Tira o endereço de leads da OLX (ao desconectar), sem travar se ela não responder. */
export async function removerLeadsDaOlx(tenantId: string) {
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "OLX" } } });
  if (!conta?.leadConfigId || !conta.accessTokenCripto) return;
  try {
    await removerEnderecoDeLeads(decifrar(conta.accessTokenCripto, chaveDoAmbiente()), conta.leadConfigId);
    await prisma.portalConta.update({ where: { id: conta.id }, data: { leadConfigId: null, leadEm: null } });
  } catch {
    // A OLX continua chamando o endereço, que passa a responder 404 enquanto a conta está desconectada.
  }
}
