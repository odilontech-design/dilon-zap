import { prisma, Prisma } from "@dilon-zap/db";
import { ordemDaConsulta, origemDaConsulta, type FiltroDeEmpresas } from "./consulta";
import { ErroSdrCore } from "./erros";
import { LIMITES } from "./limites";
import { bloqueiosDaEmpresa, carregarListas, type BloqueioEncontrado } from "./supressao";

export type { FiltroDeEmpresas } from "./consulta";

/** O que falta para uma empresa sair de "Verificar", tirado dos critérios já gravados na qualificação. */
export function motivoDoVerificar(criterios: unknown, pontuacao: number | null): string | null {
  const lista = Array.isArray(criterios) ? (criterios as { nome?: unknown; obrigatorio?: unknown; situacao?: unknown }[]) : [];
  const faltas = lista
    .filter((c) => c?.obrigatorio === true && (c.situacao === "DESCONHECIDO" || c.situacao === "NAO_VERIFICADO") && typeof c.nome === "string")
    .map((c) => (c.situacao === "NAO_VERIFICADO" ? `${c.nome} (critério livre, não verificável)` : String(c.nome)));
  if (faltas.length) return `Falta: ${faltas.join(", ")}`;
  if (pontuacao === null) return "O perfil não tem critério que o CSV permita avaliar";
  return null;
}

/**
 * Uma página de empresas, na ordem pedida. Os ids da página saem de uma consulta só (com filtro,
 * ordem, LIMIT e OFFSET no banco) e os detalhes vêm de uma segunda, só desses ids: nada de
 * carregar a base inteira.
 */
export async function listarEmpresas(tenantId: string, filtro: FiltroDeEmpresas = {}) {
  const tamanho = LIMITES.tamanhoDaPagina;
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const listas = await carregarListas(tenantId);
  const origem = origemDaConsulta(tenantId, filtro, listas);

  const [linhas, contagem, resumoPorStatus] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT e.id ${origem} ORDER BY ${ordemDaConsulta(filtro.ordem)} LIMIT ${tamanho} OFFSET ${(pagina - 1) * tamanho}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n ${origem}`),
    prisma.sdrProspecto.groupBy({
      by: ["status"],
      where: { tenantId, ...(filtro.campanhaId ? { campanhaId: filtro.campanhaId } : {}), ...(filtro.icpId ? { icpId: filtro.icpId } : {}) },
      _count: { _all: true },
    }),
  ]);

  const ids = linhas.map((l) => l.id);
  const empresas = ids.length
    ? await prisma.sdrEmpresa.findMany({
        where: { tenantId, id: { in: ids } },
        include: {
          prospectos: {
            where: { tenantId, ...(filtro.campanhaId ? { campanhaId: filtro.campanhaId } : {}) },
            select: {
              id: true, campanhaId: true, icpId: true, status: true, pontuacao: true, cobertura: true, criterios: true,
              campanha: { select: { nome: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      })
    : [];
  const porId = new Map(empresas.map((e) => [e.id, e]));

  return {
    itens: ids.flatMap((id) => {
      const x = porId.get(id);
      if (!x) return [];
      return [
        {
          id: x.id,
          cnpj: x.cnpj,
          razaoSocial: x.razaoSocial,
          nomeFantasia: x.nomeFantasia,
          uf: x.uf,
          cidade: x.cidade,
          telefone: x.telefone,
          email: x.email,
          site: x.site,
          segmento: x.segmento,
          porte: x.porte,
          cnae: x.cnae,
          origem: x.origem,
          verificada: x.verificadaEm !== null,
          createdAt: x.createdAt,
          bloqueios: bloqueiosDaEmpresa(x, listas),
          prospectos: x.prospectos.map((p) => ({
            id: p.id,
            campanhaId: p.campanhaId,
            campanhaNome: p.campanha.nome,
            icpId: p.icpId,
            status: p.status,
            pontuacao: p.pontuacao,
            cobertura: p.cobertura,
            motivo: p.status === "VERIFICAR" ? motivoDoVerificar(p.criterios, p.pontuacao) : null,
          })),
        },
      ];
    }),
    total: contagem[0]?.n ?? 0,
    pagina,
    tamanho,
    resumo: Object.fromEntries(resumoPorStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
  };
}

export async function obterEmpresa(tenantId: string, id: string) {
  const empresa = await prisma.sdrEmpresa.findFirst({
    where: { id, tenantId },
    include: {
      prospectos: {
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: { campanha: { select: { nome: true } }, icp: { select: { nome: true } } },
      },
    },
  });
  if (!empresa) throw new ErroSdrCore("empresa não encontrada", 404);

  const [listas, linha] = await Promise.all([
    carregarListas(tenantId),
    // De onde veio o dado: a linha que criou a empresa.
    prisma.sdrImportacaoLinha.findFirst({
      where: { tenantId, empresaId: id, status: "IMPORTADA" },
      select: { numero: true, importacao: { select: { id: true, nomeArquivo: true, createdAt: true } } },
    }),
  ]);
  const bloqueios: BloqueioEncontrado[] = bloqueiosDaEmpresa(empresa, listas);
  const { prospectos, ...dados } = empresa;
  return {
    ...dados,
    verificada: empresa.verificadaEm !== null,
    bloqueios,
    informadoNoCsv: linha ? { importacaoId: linha.importacao.id, arquivo: linha.importacao.nomeArquivo, linha: linha.numero, importadaEm: linha.importacao.createdAt } : null,
    prospectos: prospectos.map((p) => ({
      id: p.id,
      campanhaId: p.campanhaId,
      campanhaNome: p.campanha.nome,
      icpId: p.icpId,
      icpNome: p.icp.nome,
      status: p.status,
      pontuacao: p.pontuacao,
      cobertura: p.cobertura,
      criterios: p.criterios,
      qualificadoEm: p.qualificadoEm,
    })),
  };
}
