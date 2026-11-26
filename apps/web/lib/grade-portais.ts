import { prisma } from "@dilon-zap/db";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { NOME_PORTAL } from "@/lib/relatorios-veiculos";

/**
 * Veículos > Anúncios: a grade de carros por portal. Uma linha por carro à venda e uma coluna por portal onde a loja
 * tem conta: como está o anúncio (publicado, na fila, com erro ou não anunciado), com ligar e tirar por carro e
 * "publicar os que faltam" por portal. Só leitura aqui; as ações usam as funções de anúncio de cada portal.
 */

export const PORTAIS_DA_GRADE = ["WEBMOTORS", "MOBIAUTO", "NAPISTA", "MERCADO_LIVRE", "OLX"] as const;
export type PortalDaGrade = (typeof PORTAIS_DA_GRADE)[number];

export type AnuncioDaGrade = { ativo: boolean; status: string; url: string | null; erro: string | null; plano: string | null };

export async function gradeDePortais(tenantId: string) {
  const [contas, carros] = await Promise.all([
    prisma.portalConta.findMany({ where: { tenantId, portal: { in: [...PORTAIS_DA_GRADE] } }, select: { portal: true, status: true } }),
    prisma.veiculo.findMany({
      where: { tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } },
      orderBy: { entradaEm: "asc" },
      take: 1000,
      select: {
        id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, placa: true, status: true, entradaEm: true, kmInformado: true, zeroKm: true, precoCents: true,
        publicacoes: { where: { portal: { in: [...PORTAIS_DA_GRADE] } }, select: { portal: true, ativo: true, status: true, url: true, erro: true, plano: true } },
      },
    }),
  ]);

  // Só entram as colunas dos portais com conta da loja ou com algum anúncio já feito.
  const comAnuncio = new Set(carros.flatMap((c) => c.publicacoes.map((p) => p.portal)));
  const portais = PORTAIS_DA_GRADE.filter((p) => contas.some((c) => c.portal === p) || comAnuncio.has(p)).map((portal) => {
    const conta = contas.find((c) => c.portal === portal);
    const ativos = carros.flatMap((c) => c.publicacoes.filter((p) => p.portal === portal && p.ativo));
    const aVenda = carros.filter((c) => c.status === "DISPONIVEL");
    const fora = aVenda.filter((c) => !c.publicacoes.some((p) => p.portal === portal && p.ativo));
    return {
      portal,
      nome: NOME_PORTAL[portal],
      conectado: conta?.status === "CONECTADA",
      situacaoConta: conta?.status ?? null,
      publicados: ativos.filter((p) => p.status === "PUBLICADO").length,
      naFila: ativos.filter((p) => p.status === "FILA" || p.status === "ENVIADO").length,
      comErro: ativos.filter((p) => p.status === "ERRO").length,
      fora: fora.length,
      foraSemKm: fora.filter((c) => !c.kmInformado && !c.zeroKm).length,
    };
  });

  return {
    portais,
    carros: carros.map((c) => ({
      id: c.id,
      nome: nomeDoVeiculo(c),
      placa: c.placa,
      status: c.status,
      dias: Math.max(0, Math.floor((Date.now() - c.entradaEm.getTime()) / 86_400_000)),
      precoCents: c.precoCents,
      semKm: !c.kmInformado && !c.zeroKm,
      anuncios: Object.fromEntries(
        portais.map((p) => {
          const pub = c.publicacoes.find((x) => x.portal === p.portal);
          return [p.portal, pub ? ({ ativo: pub.ativo, status: pub.status, url: pub.url, erro: pub.erro, plano: pub.plano } satisfies AnuncioDaGrade) : null];
        })
      ) as Record<string, AnuncioDaGrade | null>,
    })),
  };
}
