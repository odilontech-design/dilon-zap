import { prisma, Prisma } from "@dilon-zap/db";
import { z } from "zod";
import { PREFIXO_ABERTURA, type LimitesDoWhatsapp } from "./canais";
import { aprovarAbordagem, criarAbordagem, exigirContatavel, exigirEmpresa, registrarResultado, resultadoSchema } from "./comercial";
import { origemDaConsulta, type FiltroDeEmpresas } from "./consulta";
import { listarEmpresas } from "./empresas";
import { ErroSdrCore } from "./erros";
import { inicioDoDia } from "./ia/config";
import { carregarListas } from "./supressao";

/**
 * A rotina diária de prospecção: a fila do dia, o preparo das mensagens, a revisão em sequência, o resultado em lote
 * e o funil por campanha. Só organiza e lê o que a rotina comercial já guarda: nenhuma tabela nova, nenhum envio.
 *
 * - A fila é sempre calculada na hora, pelas mesmas regras da central (empresa não contatada e fora da lista de
 *   bloqueio), então nada pode ficar "preso" nela nem contornar um bloqueio;
 * - preparar cria RASCUNHO a partir do modelo neutro: quem aprova, e depois quem envia, é sempre uma pessoa;
 * - o limite de WhatsApp é o mesmo de abrir a conversa (canais.ts); aqui só se mostra quanto resta.
 */

type Autor = { id: string; name: string };

export const FILA_PADRAO = 20;
export const FILA_MAXIMA = 50;

const idDoTenant = z.string().trim().min(1).max(60);
const CANAIS_DA_FILA = ["WHATSAPP", "EMAIL", "LIGACAO", "MENSAGEM"] as const;
export type CanalDaFila = (typeof CANAIS_DA_FILA)[number];
const canalDaFila = z.enum(CANAIS_DA_FILA);
/** Empresas novas por dia quando a campanha não define a meta. */
export const META_DIARIA_PADRAO = 25;
const limite = z.coerce.number().int().min(1).max(FILA_MAXIMA);

export const filtroDaFilaSchema = z.object({ campanhaId: idDoTenant.optional(), canal: canalDaFila.optional(), limite: limite.optional() }).strict();
export const preparoSchema = z
  .object({
    canal: canalDaFila,
    produto: z.enum(["DILON_ZAP", "DILON_FACILITIES"]),
    campanhaId: idDoTenant.optional(),
    limite: limite.optional(),
    /** Prepara só estas; sem a lista, prepara as que faltam na fila do dia. */
    empresaIds: z.array(idDoTenant).min(1).max(FILA_MAXIMA).optional(),
  })
  .strict();

export const aprovacaoEmLoteSchema = z
  .object({
    canal: canalDaFila.optional(),
    campanhaId: idDoTenant.optional(),
    limite: limite.optional(),
    /** Aprova só estas abordagens; sem a lista, aprova os rascunhos que a revisão mostraria agora. */
    abordagemIds: z.array(idDoTenant).min(1).max(FILA_MAXIMA).optional(),
  })
  .strict();

/** Etapas que um resultado em lote pode definir: só quem já foi contatado responde. */
export const ETAPAS_EM_LOTE = ["RESPONDEU", "INTERESSE", "INFO_SOLICITADA", "REUNIAO", "SEM_INTERESSE", "NAO_CONTATAR"] as const;
export const resultadoEmLoteSchema = z
  .object({
    empresaIds: z.array(idDoTenant).min(1).max(FILA_MAXIMA),
    etapa: z.enum(ETAPAS_EM_LOTE),
    nota: resultadoSchema.shape.nota,
    proximaAcao: resultadoSchema.shape.proximaAcao,
    proximaAcaoEm: resultadoSchema.shape.proximaAcaoEm,
  })
  .strict();

type FiltroDaFila = z.infer<typeof filtroDaFilaSchema>;
type ItemDaLista = Awaited<ReturnType<typeof listarEmpresas>>["itens"][number];
export type EstadoNaFila = "PRONTA" | "A_REVISAR" | "A_PREPARAR";

/** Só entra na fila de um canal quem tem por onde ser contatado nele. Ligação e WhatsApp usam o telefone. */
const filtroDeCanal = (canal?: CanalDaFila): FiltroDeEmpresas =>
  canal === "WHATSAPP" || canal === "LIGACAO" ? { telefone: "sim" } : canal === "EMAIL" ? { email: "sim" } : canal === "MENSAGEM" ? { instagram: "sim" } : {};

/** O preparo confere de novo, contando também o contato do decisor (que a lista não filtra). */
export function temContatoNoCanal(canal: CanalDaFila, empresa: { telefone: string | null; email: string | null; instagram: string | null }, acomp: { decisorTelefone: string | null; decisorEmail: string | null } | null) {
  if (canal === "WHATSAPP" || canal === "LIGACAO") return !!(acomp?.decisorTelefone || empresa.telefone);
  if (canal === "EMAIL") return !!(acomp?.decisorEmail || empresa.email);
  return !!empresa.instagram;
}

/** As primeiras `n` empresas de uma visão da central, na ordem de prioridade (a lista já vem paginada). */
async function primeiras(tenantId: string, filtro: FiltroDeEmpresas, n: number): Promise<ItemDaLista[]> {
  const itens: ItemDaLista[] = [];
  for (let pagina = 1; itens.length < n; pagina++) {
    const r = await listarEmpresas(tenantId, { ...filtro, ordem: "prioridade", pagina });
    itens.push(...r.itens);
    if (r.itens.length < r.tamanho) break;
  }
  return itens.slice(0, n);
}

const aberturasDeHoje = (tenantId: string, agora: Date) =>
  prisma.sdrInteracao.findMany({
    where: { tenantId, tipo: "ABORDAGEM", canal: "WHATSAPP", resultado: { startsWith: PREFIXO_ABERTURA }, createdAt: { gte: inicioDoDia(agora) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

/* --------------------------------------------------------------- Fila do dia ---- */

/**
 * A fila: primeiro o que já está pronto para contatar, depois o que espera revisão, depois o que falta preparar,
 * cada grupo por prioridade e pontuação. Quem já foi contatado sai sozinho, e a fila se completa com a próxima.
 */
export async function filaDoDia(tenantId: string, bruto: unknown = {}) {
  const f: FiltroDaFila = filtroDaFilaSchema.parse(bruto);
  const n = f.limite ?? FILA_PADRAO;
  const base: FiltroDeEmpresas = { ...(f.campanhaId ? { campanhaId: f.campanhaId } : {}), ...filtroDeCanal(f.canal) };

  const [prontas, aRevisar, todas] = await Promise.all([
    primeiras(tenantId, { ...base, visao: "aprovadas" }, n),
    primeiras(tenantId, { ...base, visao: "preparadas" }, n),
    primeiras(tenantId, { ...base, visao: "disponiveis" }, n),
  ]);
  const vistos = new Set<string>();
  const itens: (ItemDaLista & { estado: EstadoNaFila })[] = [];
  const juntar = (lista: ItemDaLista[], estado: EstadoNaFila) => {
    for (const e of lista) {
      if (itens.length >= n || vistos.has(e.id)) continue;
      vistos.add(e.id);
      // A abordagem mais avançada manda: com uma aprovada, a empresa está pronta, mesmo com outro rascunho.
      itens.push({ ...e, estado: e.comercial.abordagem === "APROVADA" ? "PRONTA" : e.comercial.abordagem === "RASCUNHO" ? "A_REVISAR" : estado });
    }
  };
  juntar(prontas, "PRONTA");
  juntar(aRevisar, "A_REVISAR");
  juntar(todas, "A_PREPARAR");
  return { itens, limite: n };
}

export type MetaDoDia = {
  /** Empresas novas a abordar hoje: a da campanha, ou 25. */
  alvo: number;
  /** Empresas que tiveram o primeiro contato registrado hoje, em qualquer canal. Follow-up não conta. */
  novasHoje: number;
  porCanal: Record<"WHATSAPP" | "EMAIL" | "LIGACAO" | "MENSAGEM" | "OUTRO", number>;
};

/**
 * A meta é de empresas novas por dia, não de mensagens: uma empresa abordada por ligação e depois por e-mail no mesmo
 * dia conta uma vez, no canal do primeiro contato. Com campanha escolhida, só as empresas dela.
 */
export async function metaDoDia(tenantId: string, campanhaId: string | undefined, agora: Date = new Date()): Promise<MetaDoDia> {
  const desde = inicioDoDia(agora);
  const campanha = campanhaId ? await prisma.sdrCampanha.findFirst({ where: { id: campanhaId, tenantId }, select: { metaDiaria: true } }) : null;
  const daCampanha = campanhaId ? { empresa: { prospectos: { some: { campanhaId } } } } : {};
  const hoje = await prisma.sdrInteracao.findMany({
    where: { tenantId, tipo: "CONTATO", createdAt: { gte: desde }, ...daCampanha },
    orderBy: { createdAt: "asc" },
    select: { empresaId: true, canal: true },
  });
  const primeiroDeHoje = new Map<string, string>();
  for (const i of hoje) if (!primeiroDeHoje.has(i.empresaId)) primeiroDeHoje.set(i.empresaId, i.canal ?? "OUTRO");
  const antes = primeiroDeHoje.size
    ? await prisma.sdrInteracao.findMany({
        where: { tenantId, tipo: "CONTATO", createdAt: { lt: desde }, empresaId: { in: [...primeiroDeHoje.keys()] } },
        distinct: ["empresaId"],
        select: { empresaId: true },
      })
    : [];
  for (const a of antes) primeiroDeHoje.delete(a.empresaId);
  const porCanal: MetaDoDia["porCanal"] = { WHATSAPP: 0, EMAIL: 0, LIGACAO: 0, MENSAGEM: 0, OUTRO: 0 };
  for (const canal of primeiroDeHoje.values()) porCanal[canal as keyof typeof porCanal]++;
  return { alvo: campanha?.metaDiaria ?? META_DIARIA_PADRAO, novasHoje: primeiroDeHoje.size, porCanal };
}

/** Os números do dia, para o topo da fila e do "Meu Comercial de Hoje". */
export async function resumoDoDia(tenantId: string, limites: LimitesDoWhatsapp, bruto: unknown = {}, agora: Date = new Date()) {
  const f = filtroDaFilaSchema.omit({ limite: true }).parse(bruto);
  const base: FiltroDeEmpresas = { ...(f.campanhaId ? { campanhaId: f.campanhaId } : {}), ...filtroDeCanal(f.canal) };
  const listas = await carregarListas(tenantId);
  const desde = inicioDoDia(agora);

  const [contagem, followups, contatosHoje, aberturas] = await Promise.all([
    prisma.$queryRaw<{ pronta: number; a_revisar: number; a_preparar: number }[]>(Prisma.sql`
      SELECT count(*) FILTER (WHERE COALESCE(ab.aprovada, false))::int AS pronta,
             count(*) FILTER (WHERE COALESCE(ab.rascunho, false) AND NOT COALESCE(ab.aprovada, false))::int AS a_revisar,
             count(*) FILTER (WHERE NOT COALESCE(ab.rascunho, false) AND NOT COALESCE(ab.aprovada, false))::int AS a_preparar
      ${origemDaConsulta(tenantId, { ...base, visao: "disponiveis" }, listas, agora)}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n ${origemDaConsulta(tenantId, { ...base, visao: "followup" }, listas, agora)}`),
    prisma.sdrInteracao.count({ where: { tenantId, tipo: "CONTATO", createdAt: { gte: desde } } }),
    aberturasDeHoje(tenantId, agora),
  ]);
  const c = contagem[0] ?? { pronta: 0, a_revisar: 0, a_preparar: 0 };
  return {
    prontas: c.pronta,
    aRevisar: c.a_revisar,
    aPreparar: c.a_preparar,
    followupsAteHoje: followups[0]?.n ?? 0,
    contatosRegistradosHoje: contatosHoje,
    meta: await metaDoDia(tenantId, f.campanhaId, agora),
    whatsapp: {
      limiteDiario: limites.limiteDiario,
      intervaloMinimoSegundos: limites.intervaloMinimoSegundos,
      conversasAbertasHoje: aberturas.length,
      restantesHoje: Math.max(0, limites.limiteDiario - aberturas.length),
    },
  };
}

/* ------------------------------------------------------ Preparar mensagens ---- */

export type ResultadoDoPreparo = {
  criadas: number;
  jaTinham: number;
  semContato: number;
  falhas: { empresaId: string; erro: string }[];
  empresas: { empresaId: string; abordagemId: string }[];
};

const nomeDoErro = (e: unknown) => (e instanceof ErroSdrCore ? e.message : e instanceof Error ? e.message.slice(0, 200) : "falha inesperada");

/**
 * Cria o rascunho (modelo neutro, sem IA) das empresas da fila que ainda não têm abordagem no canal. Repetir o pedido
 * não duplica: quem já tem rascunho ou aprovada no canal é pulado. Duas chamadas ao mesmo tempo esperam uma pela outra.
 */
export async function prepararMensagens(tenantId: string, bruto: unknown, autor: Autor): Promise<ResultadoDoPreparo> {
  const d = preparoSchema.parse(bruto);
  // A campanha escolhida decide o produto (se tiver um) e o modelo do texto.
  const campanha = d.campanhaId ? await prisma.sdrCampanha.findFirst({ where: { id: d.campanhaId, tenantId }, select: { id: true, produto: true } }) : null;
  if (d.campanhaId && !campanha) throw new ErroSdrCore("campanha não encontrada", 404);

  const trabalhar = async (): Promise<ResultadoDoPreparo> => {
    let alvos: { id: string }[];
    if (d.empresaIds) {
      alvos = [...new Set(d.empresaIds)].map((id) => ({ id }));
    } else {
      const fila = await filaDoDia(tenantId, { canal: d.canal, ...(d.campanhaId ? { campanhaId: d.campanhaId } : {}), limite: d.limite ?? FILA_PADRAO });
      alvos = fila.itens.filter((e) => e.estado === "A_PREPARAR");
    }
    const r: ResultadoDoPreparo = { criadas: 0, jaTinham: 0, semContato: 0, falhas: [], empresas: [] };
    for (const { id } of alvos) {
      try {
        const empresa = await exigirEmpresa(tenantId, id);
        await exigirContatavel(tenantId, empresa);
        const acomp = await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId: id } } });
        if (acomp && acomp.etapa !== "NAO_CONTATADA") throw new ErroSdrCore("esta empresa já foi contatada", 409);
        if (!temContatoNoCanal(d.canal, empresa, acomp)) {
          r.semContato++;
          continue;
        }
        const existente = await prisma.sdrAbordagem.findFirst({ where: { tenantId, empresaId: id, canal: d.canal, status: { in: ["RASCUNHO", "APROVADA"] } }, select: { id: true } });
        if (existente) {
          r.jaTinham++;
          continue;
        }
        const criada = await criarAbordagem(
          tenantId,
          id,
          { produto: acomp?.produto ?? campanha?.produto ?? d.produto, canal: d.canal, finalidade: "PRIMEIRO_CONTATO", texto: "modelo", modelo: true, ...(campanha ? { campanhaId: campanha.id } : {}) },
          autor
        );
        r.criadas++;
        r.empresas.push({ empresaId: id, abordagemId: criada.id });
      } catch (e) {
        r.falhas.push({ empresaId: id, erro: nomeDoErro(e) });
      }
    }
    return r;
  };

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`sdr-fila:${tenantId}`}))) t`;
      return trabalhar();
    },
    { maxWait: 20_000, timeout: 120_000 }
  );
}

/* ------------------------------------------------------- Revisão sequencial ---- */

/**
 * Os rascunhos da fila, um por abordagem, na ordem da fila. A tela mostra um de cada vez; aprovar, editar e rejeitar
 * usam as mesmas regras da ficha comercial (editar derruba a aprovação, aprovar guarda o texto exato).
 */
export async function filaDeRevisao(tenantId: string, bruto: unknown = {}) {
  const f: FiltroDaFila = filtroDaFilaSchema.parse(bruto);
  const n = f.limite ?? FILA_PADRAO;
  const empresas = await primeiras(tenantId, { ...(f.campanhaId ? { campanhaId: f.campanhaId } : {}), ...filtroDeCanal(f.canal), visao: "preparadas" }, n);
  if (!empresas.length) return { itens: [], limite: n };

  const ordem = new Map(empresas.map((e, i) => [e.id, i]));
  const canais = f.canal ? { canal: f.canal } : {};
  const rascunhos = await prisma.sdrAbordagem.findMany({
    where: { tenantId, empresaId: { in: empresas.map((e) => e.id) }, status: "RASCUNHO", ...canais },
    orderBy: { createdAt: "asc" },
  });
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const itens = rascunhos
    .sort((a, b) => (ordem.get(a.empresaId) ?? 0) - (ordem.get(b.empresaId) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, n)
    .flatMap((a) => {
      const e = porId.get(a.empresaId);
      if (!e) return [];
      return [
        {
          abordagemId: a.id,
          versao: a.versao,
          canal: a.canal,
          produto: a.produto,
          assunto: a.assunto,
          texto: a.texto,
          empresa: {
            id: e.id,
            nome: e.nomeFantasia ?? e.razaoSocial ?? "Empresa",
            cidade: e.cidade,
            uf: e.uf,
            segmento: e.segmento,
            telefone: e.telefone,
            email: e.email,
            instagram: e.instagram,
            site: e.site,
            decisorNome: e.comercial.decisorNome,
            prioridade: e.comercial.prioridade,
            pontuacao: e.prospectos[0]?.pontuacao ?? null,
          },
        },
      ];
    });
  return { itens, limite: n };
}

/* ------------------------------------------------------ Resultado em lote ---- */

export type ResultadoDoItem = { empresaId: string; ok: true; etapa: string; bloqueados: number } | { empresaId: string; ok: false; erro: string };

/**
 * Aplica o mesmo resultado a várias empresas, uma a uma, pelas mesmas regras do resultado individual (histórico,
 * bloqueio por "não contatar", encerramento de follow-up). Uma que falha não impede as outras. Só empresas já contatadas.
 */
export async function registrarResultadosEmLote(tenantId: string, bruto: unknown, autor: Autor) {
  const { empresaIds, etapa, nota, proximaAcao, proximaAcaoEm } = resultadoEmLoteSchema.parse(bruto);
  const itens: ResultadoDoItem[] = [];
  for (const empresaId of [...new Set(empresaIds)]) {
    try {
      await exigirEmpresa(tenantId, empresaId);
      const atual = await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId } }, select: { etapa: true } });
      if (!atual || atual.etapa === "NAO_CONTATADA") throw new ErroSdrCore("esta empresa ainda não foi contatada", 409);
      const r = await registrarResultado(
        tenantId,
        empresaId,
        { etapa, ...(nota !== undefined ? { nota } : {}), ...(proximaAcao !== undefined ? { proximaAcao } : {}), ...(proximaAcaoEm !== undefined ? { proximaAcaoEm } : {}) },
        autor
      );
      itens.push({ empresaId, ok: true, etapa: r.etapa, bloqueados: r.bloqueados });
    } catch (e) {
      itens.push({ empresaId, ok: false, erro: nomeDoErro(e) });
    }
  }
  return { itens, aplicadas: itens.filter((i) => i.ok).length, falhas: itens.filter((i) => !i.ok).length };
}

/* ------------------------------------------------------- Funil por campanha ---- */

type LinhaDoFunil = {
  campanha: string | null;
  empresas: number;
  a_revisar: number;
  aprovadas: number;
  contatadas: number;
  responderam: number;
  interesse: number;
  reunioes: number;
  convertidas: number;
  encerradas: number;
  horas: number | null;
};

const ZERO: Omit<LinhaDoFunil, "campanha"> = { empresas: 0, a_revisar: 0, aprovadas: 0, contatadas: 0, responderam: 0, interesse: 0, reunioes: 0, convertidas: 0, encerradas: 0, horas: null };

/**
 * Por campanha: quantas empresas estão em cada passo. "Contatadas" e "responderam" vêm do histórico de interações
 * (contato registrado e resposta registrada), e não só da etapa atual, então não somem quando a empresa avança.
 * Uma empresa em duas campanhas conta nas duas; as sem campanha aparecem à parte.
 */
export async function funilPorCampanha(tenantId: string) {
  const [linhas, campanhas] = await Promise.all([
    prisma.$queryRaw<LinhaDoFunil[]>(Prisma.sql`
      WITH base AS (
        SELECT p."campanhaId" AS campanha, COALESCE(a.etapa::text, 'NAO_CONTATADA') AS etapa,
               EXISTS (SELECT 1 FROM "SdrAbordagem" x WHERE x."tenantId" = e."tenantId" AND x."empresaId" = e.id AND x.status = 'RASCUNHO') AS rascunho,
               EXISTS (SELECT 1 FROM "SdrAbordagem" x WHERE x."tenantId" = e."tenantId" AND x."empresaId" = e.id AND x.status = 'APROVADA') AS aprovada,
               (SELECT min(i."createdAt") FROM "SdrInteracao" i WHERE i."tenantId" = e."tenantId" AND i."empresaId" = e.id AND i.tipo = 'CONTATO') AS contato,
               (SELECT min(i."createdAt") FROM "SdrInteracao" i WHERE i."tenantId" = e."tenantId" AND i."empresaId" = e.id AND i.tipo = 'RESPOSTA') AS resposta
        FROM "SdrEmpresa" e
        LEFT JOIN "SdrProspecto" p ON p."tenantId" = e."tenantId" AND p."empresaId" = e.id
        LEFT JOIN "SdrAcompanhamento" a ON a."tenantId" = e."tenantId" AND a."empresaId" = e.id
        WHERE e."tenantId" = ${tenantId}
      )
      SELECT campanha,
             count(*)::int AS empresas,
             count(*) FILTER (WHERE etapa = 'NAO_CONTATADA' AND rascunho AND NOT aprovada)::int AS a_revisar,
             count(*) FILTER (WHERE etapa = 'NAO_CONTATADA' AND aprovada)::int AS aprovadas,
             count(*) FILTER (WHERE contato IS NOT NULL)::int AS contatadas,
             count(*) FILTER (WHERE resposta IS NOT NULL)::int AS responderam,
             count(*) FILTER (WHERE etapa IN ('INTERESSE', 'INFO_SOLICITADA', 'REUNIAO', 'CONVERTIDA'))::int AS interesse,
             count(*) FILTER (WHERE etapa = 'REUNIAO')::int AS reunioes,
             count(*) FILTER (WHERE etapa = 'CONVERTIDA')::int AS convertidas,
             count(*) FILTER (WHERE etapa IN ('SEM_INTERESSE', 'NAO_CONTATAR'))::int AS encerradas,
             (avg(extract(epoch FROM (resposta - contato)) / 3600) FILTER (WHERE resposta >= contato))::float AS horas
      FROM base GROUP BY campanha`),
    prisma.sdrCampanha.findMany({ where: { tenantId }, select: { id: true, nome: true, status: true }, orderBy: { nome: "asc" } }),
  ]);

  const porCampanha = new Map(linhas.map((l) => [l.campanha, l]));
  const monta = (id: string | null, nome: string, status: string | null) => {
    const l = porCampanha.get(id) ?? { campanha: id, ...ZERO };
    return {
      campanhaId: id,
      nome,
      status,
      empresas: l.empresas,
      aRevisar: l.a_revisar,
      aprovadas: l.aprovadas,
      contatadas: l.contatadas,
      responderam: l.responderam,
      interesse: l.interesse,
      reunioes: l.reunioes,
      convertidas: l.convertidas,
      encerradas: l.encerradas,
      taxaDeResposta: l.contatadas > 0 ? Math.round((l.responderam / l.contatadas) * 1000) / 10 : null,
      horasAteAResposta: l.horas === null ? null : Math.round(l.horas * 10) / 10,
    };
  };
  const itens = campanhas.map((c) => monta(c.id, c.nome, c.status));
  if (porCampanha.has(null)) itens.push(monta(null, "Sem campanha", null));
  return { itens };
}

/* --------------------------------------------------------- Aprovação em lote ---- */

export type ResultadoDaAprovacaoEmLote = { aprovadas: number; falhas: { abordagemId: string; erro: string }[]; abordagemIds: string[] };

/**
 * Aprova de uma vez os rascunhos do dia (ou os escolhidos). É a autorização do lote por uma pessoa: aprovar NÃO envia nada,
 * só libera cada mensagem para ser contatada, uma por clique, com o texto exatamente como estava. Cada abordagem passa pelas
 * mesmas regras da aprovação individual (empresa bloqueada ou que pediu para não ser contatada não é aprovada), e uma que
 * falha não impede as outras. O teto é o da fila (50).
 */
export async function aprovarLote(tenantId: string, bruto: unknown, autor: Autor): Promise<ResultadoDaAprovacaoEmLote> {
  const d = aprovacaoEmLoteSchema.parse(bruto);
  const ids = d.abordagemIds
    ? [...new Set(d.abordagemIds)]
    : (await filaDeRevisao(tenantId, { ...(d.canal ? { canal: d.canal } : {}), ...(d.campanhaId ? { campanhaId: d.campanhaId } : {}), ...(d.limite ? { limite: d.limite } : {}) })).itens.map((i) => i.abordagemId);
  const r: ResultadoDaAprovacaoEmLote = { aprovadas: 0, falhas: [], abordagemIds: [] };
  for (const id of ids) {
    try {
      await aprovarAbordagem(tenantId, id, autor);
      r.aprovadas++;
      r.abordagemIds.push(id);
    } catch (e) {
      r.falhas.push({ abordagemId: id, erro: nomeDoErro(e) });
    }
  }
  return r;
}
