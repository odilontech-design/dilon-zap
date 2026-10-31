import { prisma, Prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "./erros";
import { LIMITES } from "./limites";
import { bloqueiosDaEmpresa, carregarListas, filtroDeEmpresasNaoSuprimidas, filtroDeEmpresasSuprimidas, type BloqueioEncontrado } from "./supressao";

export type FiltroDeEmpresas = {
  campanhaId?: string;
  icpId?: string;
  /** Status do prospecto. */
  status?: "PENDENTE" | "QUALIFICADO" | "NAO_QUALIFICADO" | "VERIFICAR";
  suprimida?: "sim" | "nao";
  busca?: string;
  pagina?: number;
};

const digitos = (s: string) => s.replace(/\D/g, "");

export async function listarEmpresas(tenantId: string, filtro: FiltroDeEmpresas = {}) {
  const listas = await carregarListas(tenantId);
  const e: Prisma.SdrEmpresaWhereInput[] = [];

  if (filtro.campanhaId || filtro.icpId || filtro.status) {
    e.push({
      prospectos: {
        some: {
          tenantId,
          ...(filtro.campanhaId ? { campanhaId: filtro.campanhaId } : {}),
          ...(filtro.icpId ? { icpId: filtro.icpId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
      },
    });
  }
  if (filtro.suprimida === "sim") e.push(filtroDeEmpresasSuprimidas(listas));
  if (filtro.suprimida === "nao") e.push(filtroDeEmpresasNaoSuprimidas(listas));
  const busca = filtro.busca?.trim();
  if (busca) {
    const d = digitos(busca);
    e.push({
      OR: [
        { razaoSocial: { contains: busca, mode: "insensitive" } },
        { nomeFantasia: { contains: busca, mode: "insensitive" } },
        { email: { contains: busca, mode: "insensitive" } },
        { dominio: { contains: busca, mode: "insensitive" } },
        { cidade: { contains: busca, mode: "insensitive" } },
        ...(d.length >= 4 ? [{ cnpj: { contains: d } }, { telefone: { contains: d } }] : []),
      ],
    });
  }
  const where: Prisma.SdrEmpresaWhereInput = { tenantId, ...(e.length ? { AND: e } : {}) };

  const pagina = Math.max(1, filtro.pagina ?? 1);
  const [itens, total, resumoPorStatus] = await Promise.all([
    prisma.sdrEmpresa.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (pagina - 1) * LIMITES.tamanhoDaPagina,
      take: LIMITES.tamanhoDaPagina,
      include: {
        prospectos: {
          where: { tenantId, ...(filtro.campanhaId ? { campanhaId: filtro.campanhaId } : {}) },
          select: { id: true, campanhaId: true, icpId: true, status: true, pontuacao: true, cobertura: true, campanha: { select: { nome: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.sdrEmpresa.count({ where }),
    prisma.sdrProspecto.groupBy({
      by: ["status"],
      where: { tenantId, ...(filtro.campanhaId ? { campanhaId: filtro.campanhaId } : {}), ...(filtro.icpId ? { icpId: filtro.icpId } : {}) },
      _count: { _all: true },
    }),
  ]);

  return {
    itens: itens.map((x) => ({
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
      prospectos: x.prospectos.map((p) => ({ id: p.id, campanhaId: p.campanhaId, campanhaNome: p.campanha.nome, icpId: p.icpId, status: p.status, pontuacao: p.pontuacao, cobertura: p.cobertura })),
    })),
    total,
    pagina,
    tamanho: LIMITES.tamanhoDaPagina,
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
