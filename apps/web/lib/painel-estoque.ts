import { prisma } from "@dilon-zap/db";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { qualidadeDoAnuncio } from "@/lib/veiculos-cadastro";

/**
 * Veículos > Painel: a visão do dono sobre o pátio, no espírito do painel do AutoCerto: quantos carros, há quanto tempo
 * parados, como o preço está frente à FIPE e uma lista de "recomendações" (o que arrumar), cada uma com os carros.
 * Só leitura; nada é gravado nem enviado.
 *
 * Definições (para o dono saber o que está lendo):
 *  - Parado: 90 dias ou mais no pátio. "+60 dias": mais de 60.
 *  - Preço × FIPE: abaixo = 5% ou mais abaixo da FIPE; acima = mais de 10% acima; no meio, "na faixa".
 *  - Publicado: aparece no site da loja ou tem anúncio ativo e publicado em algum portal.
 *  - Anúncio com problema nos portais: com erro, ou parado na fila há mais de 1 hora.
 */

const NO_PATIO = ["PREPARACAO", "DISPONIVEL", "RESERVADO"] as const;
const DIA = 86_400_000;
export const LIMITE_PARADO_DIAS = 90;
export const LIMITE_ACIMA_FIPE_PCT = 10;
export const LIMITE_ABAIXO_FIPE_PCT = 5;
const POR_LISTA = 15;

export type FaixaDeFipe = "abaixo" | "naFaixa" | "acima";

/** Diferença do preço para a FIPE em %, com sinal (null sem FIPE ou sem preço). */
export function diferencaParaFipe(precoCents: number, fipeCents: number | null): number | null {
  if (!fipeCents || fipeCents <= 0 || precoCents <= 0) return null;
  return Math.round(((precoCents - fipeCents) / fipeCents) * 1000) / 10;
}

export function faixaDeFipe(difPct: number): FaixaDeFipe {
  if (difPct > LIMITE_ACIMA_FIPE_PCT) return "acima";
  if (difPct <= -LIMITE_ABAIXO_FIPE_PCT) return "abaixo";
  return "naFaixa";
}

export function faixaDeDias(dias: number): "ate30" | "ate60" | "ate90" | "mais90" {
  if (dias <= 30) return "ate30";
  if (dias <= 60) return "ate60";
  if (dias < LIMITE_PARADO_DIAS) return "ate90";
  return "mais90";
}

export type ItemDaLista = { id: string; nome: string; dias: number; precoCents: number; detalhe: string | null };

export async function painelDoEstoque(tenantId: string, agora: Date = new Date()) {
  const carros = await prisma.veiculo.findMany({
    where: { tenantId, status: { in: [...NO_PATIO] } },
    orderBy: { entradaEm: "asc" },
    select: {
      id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, placa: true, status: true, entradaEm: true,
      km: true, kmInformado: true, zeroKm: true, precoCents: true, fipeCents: true, naVitrine: true, cor: true, cambio: true, combustivel: true,
      opcionais: true, caracteristicas: true, descricao: true,
      _count: { select: { fotos: true } },
      publicacoes: { where: { ativo: true }, select: { status: true, updatedAt: true } },
    },
  });

  const umaHora = new Date(agora.getTime() - 3_600_000);
  const linhas = carros.map((c) => {
    const dias = Math.max(0, Math.floor((agora.getTime() - c.entradaEm.getTime()) / DIA));
    const dif = diferencaParaFipe(c.precoCents, c.fipeCents);
    const publicadoEmPortal = c.publicacoes.some((p) => p.status === "PUBLICADO");
    const qualidade = qualidadeDoAnuncio({
      fotos: c._count.fotos, precoCents: c.precoCents, km: c.kmInformado ? c.km : null, zeroKm: c.zeroKm, versao: c.versao, cor: c.cor, cambio: c.cambio,
      combustivel: c.combustivel, opcionais: c.opcionais.length, descricao: c.descricao, caracteristicas: c.caracteristicas.length, placa: c.placa,
    }).nota;
    const problemaNoPortal = c.publicacoes.some((p) => p.status === "ERRO" || ((p.status === "FILA" || p.status === "ENVIADO") && p.updatedAt < umaHora));
    return {
      id: c.id, nome: nomeDoVeiculo(c), status: c.status, dias, precoCents: c.precoCents, dif, qualidade,
      publicado: c.naVitrine || publicadoEmPortal, naVitrine: c.naVitrine, semKm: !c.kmInformado && !c.zeroKm, semFotos: c._count.fotos === 0, problemaNoPortal,
    };
  });

  const item = (l: (typeof linhas)[number], detalhe: string | null = null): ItemDaLista => ({ id: l.id, nome: l.nome, dias: l.dias, precoCents: l.precoCents, detalhe });
  const lista = (filtro: (l: (typeof linhas)[number]) => boolean, detalhe?: (l: (typeof linhas)[number]) => string | null, ordem?: (a: (typeof linhas)[number], b: (typeof linhas)[number]) => number) => {
    const todos = linhas.filter(filtro);
    if (ordem) todos.sort(ordem);
    return { total: todos.length, itens: todos.slice(0, POR_LISTA).map((l) => item(l, detalhe ? detalhe(l) : null)) };
  };
  const maisAntigo = (a: (typeof linhas)[number], b: (typeof linhas)[number]) => b.dias - a.dias;

  const total = linhas.length;
  const aVenda = linhas.filter((l) => l.status !== "PREPARACAO");
  const porDias = { ate30: 0, ate60: 0, ate90: 0, mais90: 0 };
  for (const l of linhas) porDias[faixaDeDias(l.dias)]++;
  const porFipe = { abaixo: 0, naFaixa: 0, acima: 0, semFipe: 0 };
  for (const l of linhas) (l.dif === null ? (porFipe.semFipe++, null) : porFipe[faixaDeFipe(l.dif)]++);

  return {
    total,
    publicados: linhas.filter((l) => l.publicado).length,
    idadeMediaDias: total ? Math.round(linhas.reduce((s, l) => s + l.dias, 0) / total) : 0,
    maisDe60Dias: linhas.filter((l) => l.dias > 60).length,
    inativosNoSite: aVenda.filter((l) => !l.naVitrine).length,
    qualidadeMedia: total ? Math.round(linhas.reduce((s, l) => s + l.qualidade, 0) / total) : null,
    porDias,
    porFipe,
    maisAntigos: linhas.slice().sort(maisAntigo).slice(0, 3).map((l) => item(l)),
    recomendacoes: {
      semPublicacao: lista((l) => l.status === "DISPONIVEL" && !l.publicado, undefined, maisAntigo),
      paradosAcimaDaFipe: lista((l) => l.dias >= LIMITE_PARADO_DIAS && l.dif !== null && faixaDeFipe(l.dif) === "acima", (l) => `${l.dif! > 0 ? "+" : ""}${l.dif!.toLocaleString("pt-BR")}% da FIPE`, maisAntigo),
      semPreco: lista((l) => l.precoCents <= 0, undefined, maisAntigo),
      semKm: lista((l) => l.semKm, undefined, maisAntigo),
      semFotos: lista((l) => l.semFotos, undefined, maisAntigo),
      problemaNosPortais: lista((l) => l.problemaNoPortal, undefined, maisAntigo),
    },
  };
}
