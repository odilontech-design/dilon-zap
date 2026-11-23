import { prisma } from "@dilon-zap/db";
import { resumoDasParcelas, SELECT_PARCELAS } from "@/lib/otica-financeiro";
import {
  agruparPorPeriodo,
  dataDaOS,
  escolherGranularidade,
  passaNoFiltro,
  rankingPor,
  resumirHistorico,
  type FiltrosDoHistorico,
  type OSDoHistorico,
} from "@/lib/otica-historico";

/** Quantas OS a lista mostra. Os indicadores contam TODAS as do filtro, mesmo as que a lista não comporta. */
const LIMITE_DA_LISTA = 500;
/** Teto de leitura: uma ótica não chega perto, e é o que impede uma base enorme de travar a rota. */
const LIMITE_DE_LEITURA = 20_000;

/**
 * Lê as OS entregues e canceladas da empresa e monta o histórico com
 * indicadores. A lista e os números saem do MESMO conjunto filtrado.
 */
export async function montarHistoricoDeOS(tenantId: string, filtros: FiltrosDoHistorico) {
  const lidas = await prisma.ordemServico.findMany({
    where: { tenantId: tenantId, etapa: { in: ["ENTREGUE", "CANCELADA"] } },
    take: LIMITE_DE_LEITURA,
    select: {
      id: true,
      numero: true,
      etapa: true,
      historica: true,
      entregueEm: true,
      canceladaEm: true,
      previsaoEntrega: true,
      createdAt: true,
      valorCents: true,
      lentes: true,
      armacao: true,
      materialLente: true,
      fotoKey: true,
      contaId: true,
      conta: { select: { parcelas: { select: SELECT_PARCELAS } } },
      contact: { select: { id: true, name: true, waName: true, phoneNumber: true } },
      laboratorio: { select: { id: true, nome: true } },
      consultor: { select: { id: true, name: true } },
    },
  });

  const todas = lidas.map((o) => {
    const r = o.conta ? resumoDasParcelas(o.conta.parcelas) : null;
    const base: OSDoHistorico = {
      id: o.id,
      numero: o.numero,
      etapa: o.etapa as "ENTREGUE" | "CANCELADA",
      historica: o.historica,
      entregueEm: o.entregueEm,
      canceladaEm: o.canceladaEm,
      previsaoEntrega: o.previsaoEntrega,
      createdAt: o.createdAt,
      valorCents: o.valorCents,
      recebidoCents: r?.recebidoCents ?? 0,
      saldoCents: r?.saldoCents ?? 0,
      semLancamento: !o.contaId,
      laboratorio: o.laboratorio,
      consultor: o.consultor ? { id: o.consultor.id, nome: o.consultor.name } : null,
      materialLente: o.materialLente,
    };
    return { base, cartao: { lentes: o.lentes, armacao: o.armacao, fotoKey: o.fotoKey, contact: o.contact } };
  });

  const filtradas = todas.filter((x) => passaNoFiltro(x.base, filtros));
  const ordens = filtradas.map((x) => x.base);

  const granularidade = escolherGranularidade(ordens);
  const lista = [...filtradas]
    .sort((a, b) => dataDaOS(b.base).getTime() - dataDaOS(a.base).getTime() || b.base.numero - a.base.numero)
    .slice(0, LIMITE_DA_LISTA)
    .map(({ base, cartao }) => ({
      id: base.id,
      numero: base.numero,
      etapa: base.etapa,
      historica: base.historica,
      fotoKey: cartao.fotoKey,
      lentes: cartao.lentes,
      armacao: cartao.armacao,
      contact: cartao.contact,
      data: dataDaOS(base).toISOString(),
      valorCents: base.valorCents,
      recebidoCents: base.recebidoCents,
      saldoCents: base.saldoCents,
      semLancamento: base.semLancamento,
    }));

  // As opções dos filtros saem de TODAS as OS do histórico (e não só das filtradas), senão escolher um
  // laboratório faria os outros sumirem da lista de escolha.
  const labs = new Map<string, string>();
  const consultores = new Map<string, string>();
  for (const x of todas) {
    if (x.base.laboratorio) labs.set(x.base.laboratorio.id, x.base.laboratorio.nome);
    if (x.base.consultor) consultores.set(x.base.consultor.id, x.base.consultor.nome);
  }
  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

  return {
      resumo: resumirHistorico(ordens),
      serie: { granularidade, pontos: agruparPorPeriodo(ordens, granularidade) },
      porLaboratorio: rankingPor(ordens, (o) => o.laboratorio?.nome ?? null),
      porConsultor: rankingPor(ordens, (o) => o.consultor?.nome ?? null),
      porMaterial: rankingPor(ordens, (o) => o.materialLente),
      opcoes: {
        laboratorios: [...labs].map(([id, nome]) => ({ id, nome })).sort(porNome),
        consultores: [...consultores].map(([id, nome]) => ({ id, nome })).sort(porNome),
      },
      ordens: lista,
      totalDeOrdens: filtradas.length,
      limitado: filtradas.length > LIMITE_DA_LISTA,
  };
}
