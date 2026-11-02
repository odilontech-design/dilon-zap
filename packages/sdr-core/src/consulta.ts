import { Prisma } from "@dilon-zap/db";
import type { ListasDeSupressao } from "./supressao";
import { inicioDoDia } from "./ia/config";

/**
 * A consulta única das empresas do SDR: a lista, a contagem e os indicadores do painel saem do
 * mesmo FROM/WHERE, então os números do painel batem com o que a lista mostra.
 *
 * É SQL cru porque ordenar por "a melhor pontuação da empresa" atravessa uma relação 1:N
 * (a empresa pode estar em mais de uma campanha), o que o Prisma não ordena. Todo valor vai como
 * parâmetro; os únicos nomes de coluna no texto são constantes deste arquivo.
 */

export type StatusDoProspecto = "PENDENTE" | "QUALIFICADO" | "NAO_QUALIFICADO" | "VERIFICAR";
export type OrdemDaLista = "pontuacao" | "data" | "prontas" | "acao" | "prioridade";

export type EtapaComercial = "NAO_CONTATADA" | "CONTATADA" | "RESPONDEU" | "INTERESSE" | "INFO_SOLICITADA" | "REUNIAO" | "SEM_INTERESSE" | "NAO_CONTATAR" | "CONVERTIDA";
export type Produto = "DILON_ZAP" | "DILON_FACILITIES";
export type Prioridade = "ALTA" | "MEDIA" | "BAIXA";
/** Recortes prontos da central de prospecção. */
export type VisaoDaCentral = "disponiveis" | "preparadas" | "aprovadas" | "contatadas" | "responderam" | "followup" | "convertidas" | "encerradas";
export const ETAPAS_QUE_RESPONDERAM: EtapaComercial[] = ["RESPONDEU", "INTERESSE", "INFO_SOLICITADA", "REUNIAO"];

export type FiltroDeEmpresas = {
  campanhaId?: string;
  icpId?: string;
  /** Status do prospecto. */
  status?: StatusDoProspecto;
  suprimida?: "sim" | "nao";
  busca?: string;
  uf?: string;
  cidade?: string;
  segmento?: string;
  /** "sim" = só com telefone; "nao" = só sem. */
  telefone?: "sim" | "nao";
  email?: "sim" | "nao";
  ordem?: OrdemDaLista;
  etapa?: EtapaComercial;
  produto?: Produto;
  prioridade?: Prioridade;
  visao?: VisaoDaCentral;
  /** Próxima ação até o fim deste dia (AAAA-MM-DD, horário de Brasília). */
  acaoAte?: string;
  /** Só empresas sem decisor registrado. */
  semDecisor?: boolean;
  pagina?: number;
};

/** O filtro que o painel entende: só o que muda a leitura dos números. */
export type FiltroDoPainel = Pick<FiltroDeEmpresas, "campanhaId" | "icpId" | "uf" | "cidade" | "segmento">;

const escaparLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Verdadeiro quando a empresa bate com a lista de supressão. Nulo se a lista está vazia. */
export function condicaoDeBloqueio(listas: ListasDeSupressao): Prisma.Sql | null {
  const partes: Prisma.Sql[] = [];
  const em = (coluna: string, valores: string[]) => {
    if (valores.length) partes.push(Prisma.sql`e.${Prisma.raw(`"${coluna}"`)} IN (${Prisma.join(valores)})`);
  };
  const dominios = [...listas.DOMINIO.keys()];
  em("cnpj", [...listas.CNPJ.keys()]);
  em("dominio", dominios);
  em("emailDominio", dominios);
  em("email", [...listas.EMAIL.keys()]);
  em("telefone", [...listas.TELEFONE.keys()]);
  return partes.length ? Prisma.sql`(${Prisma.join(partes, " OR ")})` : null;
}

/**
 * `FROM ... WHERE ...`, com o alias `e` (empresa) e `pr` (resumo dos prospectos da empresa que
 * passam nos filtros de campanha, perfil e situação). `pr.melhor` é a maior pontuação; quando um
 * dado não permitiu pontuar, é nulo, e nulo nunca vira zero nem "atendido".
 */
export function origemDaConsulta(tenantId: string, f: FiltroDeEmpresas, listas: ListasDeSupressao, agora: Date = new Date()): Prisma.Sql {
  const doProspecto: Prisma.Sql[] = [];
  if (f.campanhaId) doProspecto.push(Prisma.sql`AND p."campanhaId" = ${f.campanhaId}`);
  if (f.icpId) doProspecto.push(Prisma.sql`AND p."icpId" = ${f.icpId}`);
  if (f.status) doProspecto.push(Prisma.sql`AND p.status = ${f.status}::"StatusProspectoSdr"`);

  const onde: Prisma.Sql[] = [Prisma.sql`e."tenantId" = ${tenantId}`];
  // Filtrar por campanha, perfil ou situação é só mostrar quem tem prospecto assim.
  if (doProspecto.length) onde.push(Prisma.sql`pr.n > 0`);
  if (f.uf) onde.push(Prisma.sql`e.uf = ${f.uf}`);
  if (f.cidade) onde.push(Prisma.sql`lower(e.cidade) = lower(${f.cidade})`);
  if (f.segmento) onde.push(Prisma.sql`lower(e.segmento) = lower(${f.segmento})`);
  if (f.telefone) onde.push(f.telefone === "sim" ? Prisma.sql`e.telefone IS NOT NULL` : Prisma.sql`e.telefone IS NULL`);
  if (f.email) onde.push(f.email === "sim" ? Prisma.sql`e.email IS NOT NULL` : Prisma.sql`e.email IS NULL`);

  if (f.suprimida) {
    // COALESCE: com colunas nulas o IN vira NULL, e "NOT NULL" não pode esconder a empresa.
    const bloqueada = condicaoDeBloqueio(listas);
    if (f.suprimida === "sim") onde.push(bloqueada ? Prisma.sql`COALESCE(${bloqueada}, false)` : Prisma.sql`false`);
    else if (bloqueada) onde.push(Prisma.sql`NOT COALESCE(${bloqueada}, false)`);
  }

  // Situação comercial. Sem linha de acompanhamento, a empresa é "não contatada", prioridade média.
  const etapa = Prisma.sql`COALESCE(a.etapa::text, 'NAO_CONTATADA')`;
  if (f.etapa) onde.push(Prisma.sql`${etapa} = ${f.etapa}`);
  if (f.produto) onde.push(Prisma.sql`a.produto = ${f.produto}::"ProdutoSdr"`);
  if (f.prioridade) onde.push(Prisma.sql`COALESCE(a.prioridade::text, 'MEDIA') = ${f.prioridade}`);
  if (f.acaoAte) {
    // Fim do dia em Brasília (UTC-3), escrito sem fuso: a coluna guarda UTC sem fuso.
    const fim = new Date(Date.parse(`${f.acaoAte}T00:00:00Z`) + 27 * 3_600_000 - 1).toISOString().slice(0, -1);
    onde.push(Prisma.sql`a."proximaAcaoEm" IS NOT NULL AND a."proximaAcaoEm" <= ${fim}::timestamp`);
  }
  if (f.semDecisor) onde.push(Prisma.sql`COALESCE(a."decisorNome", '') = ''`);
  if (f.visao) {
    const bloqueada = condicaoDeBloqueio(listas);
    const livre = bloqueada ? Prisma.sql`NOT COALESCE(${bloqueada}, false)` : Prisma.sql`true`;
    const fimDeHoje = new Date(inicioDoDia(agora).getTime() + 24 * 3_600_000 - 1).toISOString().slice(0, -1);
    const naoContatada = Prisma.sql`${etapa} = 'NAO_CONTATADA'`;
    const visoes: Record<VisaoDaCentral, Prisma.Sql> = {
      disponiveis: Prisma.sql`${naoContatada} AND ${livre}`,
      preparadas: Prisma.sql`${naoContatada} AND ${livre} AND COALESCE(ab.rascunho, false)`,
      aprovadas: Prisma.sql`${naoContatada} AND ${livre} AND COALESCE(ab.aprovada, false)`,
      contatadas: Prisma.sql`${etapa} = 'CONTATADA'`,
      responderam: Prisma.sql`${etapa} IN ('RESPONDEU', 'INTERESSE', 'INFO_SOLICITADA', 'REUNIAO')`,
      followup: Prisma.sql`a."proximaAcaoEm" IS NOT NULL AND a."proximaAcaoEm" <= ${fimDeHoje}::timestamp AND ${etapa} NOT IN ('SEM_INTERESSE', 'NAO_CONTATAR', 'CONVERTIDA')`,
      convertidas: Prisma.sql`${etapa} = 'CONVERTIDA'`,
      encerradas: Prisma.sql`${etapa} IN ('SEM_INTERESSE', 'NAO_CONTATAR')`,
    };
    onde.push(visoes[f.visao]);
  }

  const busca = f.busca?.trim();
  if (busca) {
    const parecido = `%${escaparLike(busca)}%`;
    const ou: Prisma.Sql[] = [
      Prisma.sql`e."razaoSocial" ILIKE ${parecido}`,
      Prisma.sql`e."nomeFantasia" ILIKE ${parecido}`,
      Prisma.sql`e.email ILIKE ${parecido}`,
      Prisma.sql`e.dominio ILIKE ${parecido}`,
      Prisma.sql`e.cidade ILIKE ${parecido}`,
    ];
    const numeros = busca.replace(/\D/g, "");
    if (numeros.length >= 4) ou.push(Prisma.sql`e.cnpj LIKE ${`%${numeros}%`}`, Prisma.sql`e.telefone LIKE ${`%${numeros}%`}`);
    onde.push(Prisma.sql`(${Prisma.join(ou, " OR ")})`);
  }

  const filtrosDoProspecto = doProspecto.length ? Prisma.join(doProspecto, " ") : Prisma.empty;
  return Prisma.sql`
    FROM "SdrEmpresa" e
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n,
             max(p.pontuacao) AS melhor,
             COALESCE(bool_or(p.status = 'QUALIFICADO'), false) AS q,
             COALESCE(bool_or(p.status = 'VERIFICAR'), false) AS v,
             COALESCE(bool_or(p.status = 'PENDENTE'), false) AS pe,
             COALESCE(bool_or(p.status = 'NAO_QUALIFICADO'), false) AS nq
      FROM "SdrProspecto" p
      WHERE p."tenantId" = e."tenantId" AND p."empresaId" = e.id ${filtrosDoProspecto}
    ) pr ON true
    LEFT JOIN "SdrAcompanhamento" a ON a."tenantId" = e."tenantId" AND a."empresaId" = e.id
    LEFT JOIN LATERAL (
      SELECT bool_or(x.status = 'RASCUNHO') AS rascunho, bool_or(x.status = 'APROVADA') AS aprovada
      FROM "SdrAbordagem" x
      WHERE x."tenantId" = e."tenantId" AND x."empresaId" = e.id
    ) ab ON true
    WHERE ${Prisma.join(onde, " AND ")}`;
}

/** Sempre termina em createdAt e id, para a ordem ser a mesma a cada consulta (paginação estável). */
export function ordemDaConsulta(ordem: OrdemDaLista = "pontuacao"): Prisma.Sql {
  if (ordem === "data") return Prisma.sql`e."createdAt" DESC, e.id ASC`;
  if (ordem === "acao") return Prisma.sql`a."proximaAcaoEm" ASC NULLS LAST, pr.melhor DESC NULLS LAST, e."createdAt" DESC, e.id ASC`;
  if (ordem === "prioridade") {
    return Prisma.sql`(CASE COALESCE(a.prioridade::text, 'MEDIA') WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END) ASC, pr.melhor DESC NULLS LAST, e."createdAt" DESC, e.id ASC`;
  }
  if (ordem === "prontas") {
    return Prisma.sql`(CASE WHEN pr.q THEN 0 WHEN pr.v THEN 1 WHEN pr.pe THEN 2 WHEN pr.nq THEN 3 ELSE 4 END) ASC, pr.melhor DESC NULLS LAST, e."createdAt" DESC, e.id ASC`;
  }
  return Prisma.sql`pr.melhor DESC NULLS LAST, e."createdAt" DESC, e.id ASC`;
}
