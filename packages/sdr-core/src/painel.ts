import { prisma, Prisma } from "@dilon-zap/db";
import { condicaoDeBloqueio, origemDaConsulta, type FiltroDoPainel } from "./consulta";
import { carregarListas } from "./supressao";

/**
 * Indicadores do painel do SDR. Tudo sai do mesmo FROM/WHERE da lista (ver consulta.ts), então:
 * - cada empresa conta UMA vez, mesmo estando em várias campanhas ou tendo vindo de várias importações;
 * - os números respeitam o tenant e os filtros de campanha, perfil, UF, cidade e segmento.
 *
 * Uma empresa em várias campanhas entra numa situação só, pela melhor: Qualificada, depois
 * Verificar, depois Aguardando, depois Não qualificada. Sem prospecto, conta em "fora de campanha".
 */

/** O começo do aviso que a importação grava quando descarta um telefone. Um teste guarda esta ligação. */
export const PREFIXO_AVISO_TELEFONE_DESCARTADO = "telefone inválido ignorado";

export type Indicadores = {
  /** Empresas únicas dentro do filtro. */
  total: number;
  qualificadas: number;
  /** Precisam de verificação: há critério obrigatório que o CSV não deixou conferir. */
  verificar: number;
  /** Na fila de qualificação. */
  aguardando: number;
  naoQualificadas: number;
  foraDeCampanha: number;
  /** Bloqueadas pela lista de supressão. Também contam nas situações acima; não somam à parte. */
  bloqueadas: number;
  semCnpj: number;
  semTelefone: number;
  semEmail: number;
  semSite: number;
  /** Sem telefone e sem e-mail: não há por onde contatar. */
  semContato: number;
  /** Algum dos quatro (CNPJ, telefone, e-mail, site) em falta. */
  incompletas: number;
  /** Empresas cuja importação descartou um telefone inválido e que seguem sem telefone. */
  telefoneDescartado: number;
};

export type Destaque = { valor: string; qualificadas: number; total: number };

export async function indicadoresDoPainel(tenantId: string, filtro: FiltroDoPainel = {}) {
  const listas = await carregarListas(tenantId);
  const origem = origemDaConsulta(tenantId, filtro, listas);
  const bloqueada = condicaoDeBloqueio(listas);

  const [totais, cidades, segmentos] = await Promise.all([
    prisma.$queryRaw<Indicadores[]>(Prisma.sql`
      WITH descartados AS (
        SELECT DISTINCT "empresaId" FROM "SdrImportacaoLinha"
        WHERE "tenantId" = ${tenantId} AND "empresaId" IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest(avisos) a WHERE a LIKE ${`${PREFIXO_AVISO_TELEFONE_DESCARTADO}%`})
      )
      SELECT count(*)::int AS total,
        (count(*) FILTER (WHERE pr.q))::int AS qualificadas,
        (count(*) FILTER (WHERE NOT pr.q AND pr.v))::int AS verificar,
        (count(*) FILTER (WHERE NOT pr.q AND NOT pr.v AND pr.pe))::int AS aguardando,
        (count(*) FILTER (WHERE NOT pr.q AND NOT pr.v AND NOT pr.pe AND pr.nq))::int AS "naoQualificadas",
        (count(*) FILTER (WHERE pr.n = 0))::int AS "foraDeCampanha",
        (count(*) FILTER (WHERE ${bloqueada ? Prisma.sql`COALESCE(${bloqueada}, false)` : Prisma.sql`false`}))::int AS bloqueadas,
        (count(*) FILTER (WHERE e.cnpj IS NULL))::int AS "semCnpj",
        (count(*) FILTER (WHERE e.telefone IS NULL))::int AS "semTelefone",
        (count(*) FILTER (WHERE e.email IS NULL))::int AS "semEmail",
        (count(*) FILTER (WHERE e.site IS NULL))::int AS "semSite",
        (count(*) FILTER (WHERE e.telefone IS NULL AND e.email IS NULL))::int AS "semContato",
        (count(*) FILTER (WHERE e.cnpj IS NULL OR e.telefone IS NULL OR e.email IS NULL OR e.site IS NULL))::int AS incompletas,
        (count(*) FILTER (WHERE e.telefone IS NULL AND e.id IN (SELECT "empresaId" FROM descartados)))::int AS "telefoneDescartado"
      ${origem}`),
    destaques(origem, "cidade"),
    destaques(origem, "segmento"),
  ]);

  return { indicadores: totais[0], melhoresCidades: cidades, melhoresSegmentos: segmentos };
}

/** Onde estão as melhores oportunidades: as cidades ou segmentos com mais empresas qualificadas. */
async function destaques(origem: Prisma.Sql, coluna: "cidade" | "segmento"): Promise<Destaque[]> {
  const col = Prisma.raw(`e."${coluna}"`);
  const linhas = await prisma.$queryRaw<Destaque[]>(Prisma.sql`
    SELECT ${col} AS valor, (count(*) FILTER (WHERE pr.q))::int AS qualificadas, count(*)::int AS total
    ${origem} AND ${col} IS NOT NULL
    GROUP BY ${col}
    HAVING count(*) FILTER (WHERE pr.q) > 0
    ORDER BY qualificadas DESC, total DESC, ${col} ASC
    LIMIT 8`);
  return linhas;
}

/** Valores existentes para os filtros de UF, cidade e segmento. São da empresa toda, sem filtro. */
export async function opcoesDeFiltro(tenantId: string) {
  const agrupar = async (coluna: "uf" | "cidade" | "segmento") => {
    const col = Prisma.raw(`"${coluna}"`);
    return prisma.$queryRaw<{ valor: string; empresas: number }[]>(Prisma.sql`
      SELECT ${col} AS valor, count(*)::int AS empresas FROM "SdrEmpresa"
      WHERE "tenantId" = ${tenantId} AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY empresas DESC, ${col} ASC LIMIT 300`);
  };
  const [ufs, cidades, segmentos] = await Promise.all([agrupar("uf"), agrupar("cidade"), agrupar("segmento")]);
  return { ufs: ufs.sort((a, b) => a.valor.localeCompare(b.valor)), cidades, segmentos };
}
