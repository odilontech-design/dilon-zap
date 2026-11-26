import { prisma } from "@dilon-zap/db";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { diaDeBrasilia } from "@/lib/estatisticas-vitrine";

/**
 * Relatórios da revenda (Veículos > Relatórios), no jeito do AutoCerto: Estoque, Visitas no
 * site, Integração (os anúncios em cada portal) e Desempenho por veículo.
 */

const NO_PATIO = ["PREPARACAO", "DISPONIVEL", "RESERVADO"] as const;
const DIA = 86_400_000;
const PORTAIS = ["OLX", "WEBMOTORS", "MOBIAUTO", "NAPISTA", "MERCADO_LIVRE"] as const;
export const NOME_PORTAL: Record<string, string> = { OLX: "OLX", WEBMOTORS: "Webmotors", MOBIAUTO: "MobiAuto", NAPISTA: "NaPista", MERCADO_LIVRE: "Mercado Livre" };

const diasDesde = (d: Date, agora: Date) => Math.max(0, Math.floor((agora.getTime() - d.getTime()) / DIA));

// ---------------------------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------------------------

export type LinhaEstoque = {
  id: string;
  nome: string;
  placa: string | null;
  status: string;
  dias: number;
  km: number | null;
  precoCents: number;
  fipeCents: number | null;
  custoCents: number;
  margemCents: number | null;
  fotos: number;
  naVitrine: boolean;
  portais: string[];
};

export async function relatorioEstoque(tenantId: string, agora = new Date()) {
  const carros = await prisma.veiculo.findMany({
    where: { tenantId, status: { in: [...NO_PATIO] } },
    orderBy: { entradaEm: "asc" },
    select: {
      id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, placa: true, status: true, entradaEm: true,
      km: true, kmInformado: true, precoCents: true, fipeCents: true, naVitrine: true, origem: true, consignacaoValorCents: true,
      _count: { select: { fotos: true } },
      custos: { select: { valorCents: true } },
      publicacoes: { where: { ativo: true, status: "PUBLICADO" }, select: { portal: true } },
    },
  });
  const linhas: LinhaEstoque[] = carros.map((c) => {
    // Consignado: o "custo" é o que o dono recebe na venda (mais o que a loja gastou nele).
    const custoCents = c.custos.reduce((s, x) => s + x.valorCents, 0) + (c.origem === "CONSIGNACAO" ? c.consignacaoValorCents ?? 0 : 0);
    return {
      id: c.id,
      nome: nomeDoVeiculo(c),
      placa: c.placa,
      status: c.status,
      dias: diasDesde(c.entradaEm, agora),
      km: c.kmInformado ? c.km : null,
      precoCents: c.precoCents,
      fipeCents: c.fipeCents,
      custoCents,
      margemCents: c.precoCents > 0 && custoCents > 0 ? c.precoCents - custoCents : null,
      fotos: c._count.fotos,
      naVitrine: c.naVitrine,
      portais: c.publicacoes.map((p) => NOME_PORTAL[p.portal] ?? p.portal),
    };
  });
  const comPreco = linhas.filter((l) => l.precoCents > 0);
  return {
    linhas,
    total: linhas.length,
    porStatus: Object.fromEntries(NO_PATIO.map((s) => [s, linhas.filter((l) => l.status === s).length])),
    valorAVendaCents: comPreco.reduce((s, l) => s + l.precoCents, 0),
    custoCents: linhas.reduce((s, l) => s + l.custoCents, 0),
    idadeMedia: linhas.length ? Math.round(linhas.reduce((s, l) => s + l.dias, 0) / linhas.length) : 0,
    parados90: linhas.filter((l) => l.dias >= 90).length,
    semFotos: linhas.filter((l) => l.fotos === 0).length,
  };
}

/** O estoque em CSV (abre no Excel: separador ";" e vírgula decimal). */
export function estoqueEmCsv(linhas: LinhaEstoque[]): string {
  const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
  const cel = (v: string | number | null) => {
    const t = v == null ? "" : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const cab = ["Veículo", "Placa", "Situação", "Dias em estoque", "Km", "Preço", "FIPE", "Custo", "Margem prevista", "Fotos", "No site", "Portais"];
  const corpo = linhas.map((l) => [l.nome, l.placa, l.status, l.dias, l.km, reais(l.precoCents), reais(l.fipeCents), reais(l.custoCents), reais(l.margemCents), l.fotos, l.naVitrine ? "sim" : "não", l.portais.join(", ")].map(cel).join(";"));
  return "﻿" + [cab.join(";"), ...corpo].join("\r\n");
}

// ---------------------------------------------------------------------------------------------
// Visitas no site
// ---------------------------------------------------------------------------------------------

export async function relatorioVisitas(tenantId: string, dias = 30, agora = new Date()) {
  const fim = diaDeBrasilia(agora);
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA);
  const inicioAnterior = new Date(inicio.getTime() - dias * DIA);
  const [linhas, anteriores] = await Promise.all([
    prisma.estatisticaVitrine.findMany({ where: { tenantId, dia: { gte: inicio, lte: fim } } }),
    prisma.estatisticaVitrine.aggregate({ where: { tenantId, dia: { gte: inicioAnterior, lt: inicio } }, _sum: { visitas: true } }),
  ]);
  const porDia = new Map<string, { visitas: number; whatsapp: number; formularios: number }>();
  for (let i = 0; i < dias; i++) porDia.set(new Date(inicio.getTime() + i * DIA).toISOString().slice(0, 10), { visitas: 0, whatsapp: 0, formularios: 0 });
  const porCarro = new Map<string, { visitas: number; whatsapp: number; formularios: number }>();
  for (const l of linhas) {
    const d = porDia.get(l.dia.toISOString().slice(0, 10));
    if (d) { d.visitas += l.visitas; d.whatsapp += l.whatsapp; d.formularios += l.formularios; }
    if (l.veiculoId) {
      const c = porCarro.get(l.veiculoId) ?? { visitas: 0, whatsapp: 0, formularios: 0 };
      c.visitas += l.visitas; c.whatsapp += l.whatsapp; c.formularios += l.formularios;
      porCarro.set(l.veiculoId, c);
    }
  }
  const totais = [...porDia.values()].reduce((s, d) => ({ visitas: s.visitas + d.visitas, whatsapp: s.whatsapp + d.whatsapp, formularios: s.formularios + d.formularios }), { visitas: 0, whatsapp: 0, formularios: 0 });
  const nomes = new Map((await prisma.veiculo.findMany({ where: { tenantId, id: { in: [...porCarro.keys()] } }, select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true } })).map((v) => [v.id, nomeDoVeiculo(v)]));
  const maisVistos = [...porCarro.entries()]
    .filter(([id]) => nomes.has(id))
    .map(([id, n]) => ({ id, nome: nomes.get(id)!, ...n }))
    .sort((a, b) => b.visitas - a.visitas)
    .slice(0, 10);
  const anterior = anteriores._sum.visitas ?? 0;
  return {
    dias,
    porDia: [...porDia.entries()].map(([dia, n]) => ({ dia, ...n })),
    totais,
    variacao: anterior > 0 ? Math.round(((totais.visitas - anterior) / anterior) * 100) : null,
    conversao: totais.visitas > 0 ? Math.round(((totais.whatsapp + totais.formularios) / totais.visitas) * 1000) / 10 : null,
    maisVistos,
  };
}

// ---------------------------------------------------------------------------------------------
// Integração (portais)
// ---------------------------------------------------------------------------------------------

export async function relatorioIntegracao(tenantId: string) {
  const [contas, pubs, aVenda] = await Promise.all([
    prisma.portalConta.findMany({ where: { tenantId }, select: { portal: true, status: true } }),
    prisma.publicacaoPortal.findMany({
      where: { tenantId },
      select: { portal: true, status: true, ativo: true, erro: true, url: true, enviadoEm: true, veiculo: { select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, placa: true, status: true } } },
    }),
    prisma.veiculo.findMany({ where: { tenantId, status: "DISPONIVEL" }, select: { id: true } }),
  ]);
  const portais = PORTAIS.map((portal) => {
    const conta = contas.find((c) => c.portal === portal);
    const doPortal = pubs.filter((p) => p.portal === portal);
    const ativos = doPortal.filter((p) => p.ativo);
    const anunciados = new Set(ativos.map((p) => p.veiculo.id));
    return {
      portal,
      nome: NOME_PORTAL[portal],
      conectado: conta?.status === "CONECTADA",
      situacaoConta: conta?.status ?? null,
      publicados: ativos.filter((p) => p.status === "PUBLICADO").length,
      naFila: ativos.filter((p) => p.status === "FILA" || p.status === "ENVIADO").length,
      comErro: ativos.filter((p) => p.status === "ERRO").length,
      foraDoPortal: aVenda.filter((v) => !anunciados.has(v.id)).length,
    };
  });
  const erros = pubs
    .filter((p) => p.ativo && p.status === "ERRO")
    .map((p) => ({ veiculoId: p.veiculo.id, nome: nomeDoVeiculo(p.veiculo), placa: p.veiculo.placa, portal: NOME_PORTAL[p.portal] ?? p.portal, erro: p.erro ?? "erro sem detalhe" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { portais, erros, aVenda: aVenda.length };
}

// ---------------------------------------------------------------------------------------------
// Desempenho por veículo
// ---------------------------------------------------------------------------------------------

export type LinhaDesempenho = { id: string; nome: string; status: string; dias: number; precoCents: number; visitas: number; whatsapp: number; formularios: number; leadsPortais: number; contatos: number; alerta: string | null };

export async function relatorioDesempenho(tenantId: string, dias = 30, agora = new Date()) {
  const fim = diaDeBrasilia(agora);
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA);
  const [carros, estat, leads] = await Promise.all([
    prisma.veiculo.findMany({ where: { tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, status: true, entradaEm: true, precoCents: true } }),
    prisma.estatisticaVitrine.groupBy({ by: ["veiculoId"], where: { tenantId, dia: { gte: inicio, lte: fim }, veiculoId: { not: "" } }, _sum: { visitas: true, whatsapp: true, formularios: true } }),
    prisma.leadPortal.groupBy({ by: ["veiculoId"], where: { tenantId, recebidoEm: { gte: inicio }, veiculoId: { not: null } }, _count: { _all: true } }),
  ]);
  const est = new Map(estat.map((e) => [e.veiculoId, e._sum]));
  const lp = new Map(leads.map((l) => [l.veiculoId, l._count._all]));
  const linhas: LinhaDesempenho[] = carros.map((c) => {
    const e = est.get(c.id);
    const visitas = e?.visitas ?? 0, whatsapp = e?.whatsapp ?? 0, formularios = e?.formularios ?? 0, leadsPortais = lp.get(c.id) ?? 0;
    const contatos = whatsapp + formularios + leadsPortais;
    const diasNoPatio = diasDesde(c.entradaEm, agora);
    // Os alertas que pedem ação: muita visita e nenhum contato (preço? fotos?) ou parado há muito tempo.
    const alerta = visitas >= 30 && contatos === 0 ? "muitas visitas e nenhum contato: reveja preço e fotos" : diasNoPatio >= 60 && contatos === 0 ? `${diasNoPatio} dias sem contato no período` : null;
    return { id: c.id, nome: nomeDoVeiculo(c), status: c.status, dias: diasNoPatio, precoCents: c.precoCents, visitas, whatsapp, formularios, leadsPortais, contatos, alerta };
  });
  linhas.sort((a, b) => b.contatos - a.contatos || b.visitas - a.visitas);
  return { dias, linhas };
}

// ---------------------------------------------------------------------------------------------
// Vendas (as importadas da planilha de controle e as feitas no Zap)
// ---------------------------------------------------------------------------------------------

export type DadosVendas = {
  meses: number;
  total: { vendas: number; valorCents: number; ticketCents: number; financiadas: number; aproximadas: number };
  porMes: { mes: string; vendas: number; valorCents: number; financiadas: number }[];
  porModelo: { nome: string; vendas: number }[];
  porMarca: { nome: string; vendas: number }[];
  porBanco: { nome: string; vendas: number; financiadoCents: number }[];
};

/** Vendas concluídas dos últimos `meses` meses (padrão 12), por mês, modelo, marca e banco. Sempre da empresa da sessão. */
export async function relatorioVendas(tenantId: string, meses = 12, agora = new Date()): Promise<DadosVendas> {
  const hoje = diaDeBrasilia(agora);
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (meses - 1), 1));
  const vendas = await prisma.vendaVeiculo.findMany({
    where: { tenantId, status: "CONCLUIDA", concluidaEm: { gte: inicio } },
    select: { precoCents: true, financiadoCents: true, banco: true, concluidaEm: true, observacoes: true, veiculo: { select: { marca: true, modelo: true } } },
    take: 20_000,
  });
  const porMes = new Map<string, { vendas: number; valorCents: number; financiadas: number }>();
  for (let i = 0; i < meses; i++) {
    const d = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
    porMes.set(d.toISOString().slice(0, 7), { vendas: 0, valorCents: 0, financiadas: 0 });
  }
  const modelos = new Map<string, number>();
  const marcas = new Map<string, number>();
  const bancos = new Map<string, { vendas: number; financiadoCents: number }>();
  let valorCents = 0, financiadas = 0, aproximadas = 0;
  for (const v of vendas) {
    const preco = v.precoCents ?? 0;
    const financiada = (v.financiadoCents ?? 0) > 0;
    valorCents += preco;
    if (financiada) financiadas++;
    if (v.observacoes?.startsWith("Importada da planilha")) aproximadas++;
    const m = porMes.get((v.concluidaEm ?? inicio).toISOString().slice(0, 7));
    if (m) { m.vendas++; m.valorCents += preco; if (financiada) m.financiadas++; }
    const nome = `${v.veiculo.marca} ${v.veiculo.modelo}`;
    modelos.set(nome, (modelos.get(nome) ?? 0) + 1);
    marcas.set(v.veiculo.marca, (marcas.get(v.veiculo.marca) ?? 0) + 1);
    if (v.banco) { const b = bancos.get(v.banco) ?? { vendas: 0, financiadoCents: 0 }; b.vendas++; b.financiadoCents += v.financiadoCents ?? 0; bancos.set(v.banco, b); }
  }
  const topo = <T extends { vendas: number }>(m: Map<string, T>, n: number) => [...m.entries()].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.vendas - a.vendas || a.nome.localeCompare(b.nome)).slice(0, n);
  return {
    meses,
    total: { vendas: vendas.length, valorCents, ticketCents: vendas.length ? Math.round(valorCents / vendas.length) : 0, financiadas, aproximadas },
    porMes: [...porMes.entries()].map(([mes, x]) => ({ mes, ...x })),
    porModelo: topo(new Map([...modelos].map(([k, n]) => [k, { vendas: n }])), 10),
    porMarca: topo(new Map([...marcas].map(([k, n]) => [k, { vendas: n }])), 8),
    porBanco: topo(bancos, 8),
  };
}
