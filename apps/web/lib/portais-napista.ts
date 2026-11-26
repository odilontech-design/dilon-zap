import { prisma } from "@dilon-zap/db";
import {
  SessaoNapista,
  appNapistaDoAmbiente,
  assinarEstado,
  chaveDoAmbiente,
  contaNapistaGuardada,
  guardarContaNapista,
  lerEstado,
  novosCatalogosNapista,
  ordenarVersoesNapista,
  versoesDoCarroNapista,
  telefoneDoLead,
  trocarCodigoNapista,
  urlDeAutorizacaoNapista,
  type ContaNapista,
} from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";
import { registrarEntradaLead } from "@/lib/lead-portal";

/**
 * Lado do painel do NaPista. O lojista autoriza o Zap por OAuth com o mesmo usuário e senha do
 * NaPista; guardamos a loja (seller) e os tokens cifrados em `PortalConta` (PORTAIS_CHAVE).
 * O envio dos anúncios é do worker dos portais; os leads são buscados por cron
 * (/api/cron/napista-leads) e viram negociação no CRM, como os dos outros portais.
 * Variáveis: NAPISTA_CLIENT_ID (o client_id que o NaPista libera para a Dilon Tech) e, enquanto
 * o acesso for só de desenvolvimento, NAPISTA_AMBIENTE=development.
 * URL de retorno: `<NEXTAUTH_URL>/api/portais/napista/retorno`.
 */

export const integracaoNapistaConfigurada = () => !!(appNapistaDoAmbiente() && segredoDosPortais());

export function urlDeConexaoNapista(tenantId: string, userId: string, urlBase: string): string | null {
  const app = appNapistaDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return null;
  return urlDeAutorizacaoNapista(app, assinarEstado({ tenantId, userId, portal: "NAPISTA" }, segredo));
}

/** O retorno do OAuth: troca o código pelos tokens, descobre a loja e guarda a conta. */
export async function concluirConexaoNapista(code: string, state: string, urlBase: string, esperado: { tenantId: string; userId: string }): Promise<{ ok: true } | { ok: false; motivo: "invalida" | "falhou" | "nao-configurada" | "sem-loja"; erro?: string }> {
  const app = appNapistaDoAmbiente(urlBase);
  const segredo = segredoDosPortais();
  if (!app || !segredo) return { ok: false, motivo: "nao-configurada" };
  const estado = lerEstado(state, segredo);
  if (!estado || estado.portal !== "NAPISTA" || estado.tenantId !== esperado.tenantId || estado.userId !== esperado.userId) return { ok: false, motivo: "invalida" };
  try {
    const t = await trocarCodigoNapista(app, code);
    const lojas = await new SessaoNapista(t, "", app).lojas();
    if (!lojas.length) return { ok: false, motivo: "sem-loja" };
    const conta: ContaNapista = { sellerId: lojas[0].id, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm };
    const dados = { accessTokenCripto: guardarContaNapista(conta, chaveDoAmbiente(segredo)), status: "CONECTADA" as const, contaNome: lojas[0].nome, contaEmail: lojas[0].documento || null, erro: null, conectadaEm: new Date() };
    await prisma.portalConta.upsert({ where: { tenantId_portal: { tenantId: esperado.tenantId, portal: "NAPISTA" } }, create: { tenantId: esperado.tenantId, portal: "NAPISTA", ...dados }, update: dados });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "falhou", erro: e instanceof Error ? e.message : undefined };
  }
}

export async function desconectarNapista(tenantId: string) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "NAPISTA" }, data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null } });
}

/** Uma sessão da loja com o NaPista (renova o token e guarda o novo). */
async function sessaoDaLoja(tenantId: string): Promise<SessaoNapista | null> {
  const app = appNapistaDoAmbiente();
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "NAPISTA" } } });
  if (!app || !segredo || !conta || conta.status === "DESCONECTADA" || !conta.accessTokenCripto) return null;
  const chave = chaveDoAmbiente(segredo);
  const g = contaNapistaGuardada(conta.accessTokenCripto, chave);
  return new SessaoNapista({ access: g.access, refresh: g.refresh, expiraEm: g.expiraEm }, g.sellerId, app, async (t) => {
    await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaNapista({ ...g, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm }, chave) } });
  });
}

export async function lojasNapista(tenantId: string) {
  const s = await sessaoDaLoja(tenantId);
  return s ? s.lojas() : null;
}

/** Troca a loja (seller) da conta, para quem gerencia mais de uma no NaPista. */
export async function definirLojaNapista(tenantId: string, sellerId: string): Promise<boolean> {
  const segredo = segredoDosPortais();
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "NAPISTA" } } });
  if (!segredo || !conta?.accessTokenCripto) return false;
  const chave = chaveDoAmbiente(segredo);
  const g = contaNapistaGuardada(conta.accessTokenCripto, chave);
  await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaNapista({ ...g, sellerId }, chave) } });
  return true;
}

export async function anunciarNoNapista(tenantId: string, veiculoIds: string[]): Promise<{ ligados: number; semKm: number }> {
  const carros = await prisma.veiculo.findMany({ where: { tenantId, id: { in: veiculoIds } }, select: { id: true, kmInformado: true } });
  let semKm = 0;
  for (const c of carros) {
    if (c.kmInformado === false) semKm++;
    await prisma.publicacaoPortal.upsert({
      where: { veiculoId_portal: { veiculoId: c.id, portal: "NAPISTA" } },
      create: { tenantId, veiculoId: c.id, portal: "NAPISTA", idEnviado: c.id.slice(-12) },
      update: { ativo: true, erro: null, proximaTentativaEm: null },
    });
  }
  return { ligados: carros.length, semKm };
}

export async function desligarDoNapista(tenantId: string, veiculoId: string) {
  await prisma.publicacaoPortal.updateMany({ where: { tenantId, veiculoId, portal: "NAPISTA" }, data: { ativo: false, proximaTentativaEm: null } });
}

const placaLimpa = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Ensaio da troca de sistema (só leitura): o que a loja já tem no ar no NaPista contra o estoque do Zap, casando pela placa. */
export async function conferirNapista(tenantId: string) {
  const s = await sessaoDaLoja(tenantId);
  if (!s) return null;
  const existentes = await s.ofertas("PUBLISHED");
  const carros = await prisma.veiculo.findMany({ where: { tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select: { id: true, marca: true, modelo: true, anoModelo: true, placa: true } });
  const la = new Map(existentes.map((o) => [o.placa, o]));
  const noZap = new Set(carros.map((c) => placaLimpa(c.placa)).filter(Boolean));
  return {
    noPortal: existentes.length,
    noZap: carros.length,
    casam: carros.filter((c) => la.has(placaLimpa(c.placa))).length,
    soNoZap: carros.filter((c) => !la.has(placaLimpa(c.placa))).slice(0, 100).map((c) => ({ id: c.id, nome: `${c.marca} ${c.modelo} ${c.anoModelo}`, placa: c.placa })),
    soNoPortal: existentes.filter((o) => !noZap.has(o.placa)).slice(0, 100).map((o) => ({ codigo: o.id, placa: o.placa || null })),
  };
}

export async function painelNapista(tenantId: string) {
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const [conta, porStatus, problemas, semKm, leads30d] = await Promise.all([
    prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId, portal: "NAPISTA" } }, select: { status: true, contaNome: true, contaEmail: true, erro: true, conectadaEm: true, leadEm: true, leadErro: true } }),
    prisma.publicacaoPortal.groupBy({ by: ["status"], where: { tenantId, portal: "NAPISTA", ativo: true }, _count: true }),
    prisma.publicacaoPortal.findMany({
      where: { tenantId, portal: "NAPISTA", ativo: true, erro: { not: null }, veiculo: { status: "DISPONIVEL" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, veiculoId: true, status: true, erro: true, veiculo: { select: { marca: true, modelo: true, versao: true, anoModelo: true, placa: true } } },
    }),
    prisma.veiculo.count({ where: { tenantId, status: "DISPONIVEL", kmInformado: false } }),
    prisma.leadPortal.count({ where: { tenantId, portal: "NAPISTA", recebidoEm: { gte: desde } } }),
  ]);
  return { configurada: integracaoNapistaConfigurada(), conta, contagem: Object.fromEntries(porStatus.map((s) => [s.status, s._count])) as Record<string, number>, problemas, semKm, leads30d };
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Busca os leads recentes do NaPista de uma loja e registra os novos no CRM (contato +
 * negociação + tarefa de chamar). O lead do NaPista não reaparece: a chave é o id dele.
 * Olha os últimos 3 dias a cada rodada, para não perder nada se uma rodada falhar.
 */
export async function buscarLeadsDoNapista(tenantId: string, agora = new Date()): Promise<{ novos: number; vistos: number } | null> {
  const s = await sessaoDaLoja(tenantId);
  if (!s) return null;
  const leads = await s.leads(dia(new Date(agora.getTime() - 3 * 86_400_000)), dia(new Date(agora.getTime() + 86_400_000)));
  let novos = 0;
  for (const l of leads) {
    const carro = l.placa ? await prisma.veiculo.findFirst({ where: { tenantId, placa: l.placa }, select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true } }) : null;
    const extras = [l.mensagem, l.entradaCents ? `Entrada de R$ ${(l.entradaCents / 100).toLocaleString("pt-BR")}${l.parcelas ? ` em ${l.parcelas}x` : ""}` : null, l.credito === "PRE_APPROVED" ? "Crédito pré-aprovado" : null, !carro && l.versao ? `Carro: ${l.versao}` : null].filter(Boolean).join(" · ");
    const r = await registrarEntradaLead(tenantId, {
      portal: "NAPISTA",
      chave: `np:${l.id}`,
      contato: l.entradaCents || l.parcelas ? "simulação de financiamento" : "mensagem",
      origem: l.entradaCents || l.parcelas ? "financing" : "napista",
      nome: l.nome,
      email: l.email,
      telefone: l.telefone ? telefoneDoLead(l.telefone) : null,
      mensagem: extras.slice(0, 1000),
      idNoPortal: l.id,
      linkAnuncio: null,
      criadoEm: l.atualizadoEm,
      carro,
    });
    if (!r.duplicado) novos++;
  }
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "NAPISTA" }, data: { leadEm: agora, leadErro: null } });
  return { novos, vistos: leads.length };
}

/** Todas as lojas com o NaPista conectado (para o cron dos leads). */
export async function lojasComNapista(): Promise<string[]> {
  return (await prisma.portalConta.findMany({ where: { portal: "NAPISTA", status: "CONECTADA" }, select: { tenantId: true } })).map((c) => c.tenantId);
}

export async function registrarFalhaDeLeadsNapista(tenantId: string, erro: string) {
  await prisma.portalConta.updateMany({ where: { tenantId, portal: "NAPISTA" }, data: { leadErro: erro.slice(0, 500) } });
}

// ---- Escolher a versão do catálogo quando a automática não teve certeza ----------------------

export type PendenciaVersaoNapista = {
  veiculoId: string;
  nome: string;
  placa: string | null;
  anoModelo: number;
  /** O que a ficha diz de versão. */
  pedida: string | null;
  /** "ok" tem lista para escolher; os outros dois dizem o que o NaPista não reconheceu. */
  estado: "ok" | "sem-marca" | "sem-modelo";
  mensagem: string | null;
  opcoes: { id: string; nome: string; nota: number }[];
  /** A mais parecida, só quando é boa o bastante para vir marcada (nota 0,5 ou mais). */
  sugerida: string | null;
};

type CarroDaPublicacao = { id: string; marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null };
const carroDaPublicacao = { id: true, marca: true, modelo: true, versao: true, anoModelo: true, placa: true } as const;
const semVersaoEscolhida = (catalogo: unknown) => !(catalogo && typeof catalogo === "object" && (catalogo as { versao?: unknown }).versao);

/** Carros à venda ligados ao NaPista que ainda não têm versão do catálogo, com as opções do catálogo para a gestão escolher. */
export async function versoesPendentesNapista(tenantId: string, limite = 12, deslocar = 0): Promise<{ total: number; itens: PendenciaVersaoNapista[] } | null> {
  const s = await sessaoDaLoja(tenantId);
  if (!s) return null;
  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "NAPISTA", ativo: true, status: { in: ["FILA", "ERRO"] }, veiculo: { status: "DISPONIVEL" } },
    orderBy: { id: "asc" },
    select: { catalogo: true, veiculo: { select: carroDaPublicacao } },
  });
  const pendentes = pubs.filter((p) => semVersaoEscolhida(p.catalogo));
  const cache = novosCatalogosNapista();
  const itens: PendenciaVersaoNapista[] = [];
  for (const p of pendentes.slice(deslocar, deslocar + limite)) {
    const c: CarroDaPublicacao = p.veiculo;
    const r = await versoesDoCarroNapista(s, c, cache);
    const opcoes = ordenarVersoesNapista(c.versao, r.versoes);
    itens.push({
      veiculoId: c.id,
      nome: `${c.marca} ${c.modelo} ${c.anoModelo}`,
      placa: c.placa,
      anoModelo: c.anoModelo,
      pedida: c.versao,
      estado: r.estado,
      mensagem: r.estado === "ok" ? null : r.mensagem,
      opcoes,
      sugerida: opcoes[0] && opcoes[0].nota >= 0.5 ? opcoes[0].id : null,
    });
  }
  return { total: pendentes.length, itens };
}

/** Guarda a versão escolhida pela gestão no anúncio e devolve o carro à fila. Só aceita versões que existem no catálogo daquele carro. */
export async function salvarVersoesNapista(tenantId: string, escolhas: { veiculoId: string; versaoId: string }[]): Promise<{ salvas: number; recusadas: { veiculoId: string; motivo: string }[] } | null> {
  const s = await sessaoDaLoja(tenantId);
  if (!s) return null;
  const cache = novosCatalogosNapista();
  const recusadas: { veiculoId: string; motivo: string }[] = [];
  let salvas = 0;
  for (const e of escolhas) {
    const pub = await prisma.publicacaoPortal.findUnique({
      where: { veiculoId_portal: { veiculoId: e.veiculoId, portal: "NAPISTA" } },
      select: { id: true, tenantId: true, catalogo: true, veiculo: { select: carroDaPublicacao } },
    });
    if (!pub || pub.tenantId !== tenantId) {
      recusadas.push({ veiculoId: e.veiculoId, motivo: "carro não está ligado ao NaPista" });
      continue;
    }
    const r = await versoesDoCarroNapista(s, pub.veiculo, cache);
    const versao = r.versoes.find((v) => v.id === e.versaoId);
    if (!versao) {
      recusadas.push({ veiculoId: e.veiculoId, motivo: "essa versão não existe no catálogo do NaPista para este carro" });
      continue;
    }
    const antigo = (pub.catalogo && typeof pub.catalogo === "object" ? pub.catalogo : {}) as Record<string, unknown>;
    await prisma.publicacaoPortal.update({
      where: { id: pub.id },
      data: { catalogo: { ...antigo, versao: versao.id, versaoNome: versao.nome }, status: "FILA", erro: null, tentativas: 0, proximaTentativaEm: null },
    });
    salvas++;
  }
  return { salvas, recusadas };
}
