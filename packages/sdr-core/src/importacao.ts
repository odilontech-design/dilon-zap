import { createHash, randomUUID } from "node:crypto";
import { prisma, Prisma } from "@dilon-zap/db";
import { carregarAlvo, type AlvoDeQualificacao } from "./alvo";
import { lerCsv } from "./csv";
import { IndiceDeEmpresas, mesclarPreenchendoVazios, type EmpresaConhecida } from "./dedup";
import { ErroSdrCore } from "./erros";
import { LIMITES } from "./limites";
import { extrairBruto, sugerirMapeamento, validarMapeamento, type Mapeamento } from "./mapeamento";
import { normalizarLinha, type Bruto, type EmpresaNormalizada, type LinhaNormalizada } from "./normalizacao";
import { qualificar } from "./qualificacao";
import { bloqueiosDaEmpresa, carregarListas } from "./supressao";
import { enfileirar } from "./fila";

/* ------------------------------------------------------------- Análise ---- */

export type LinhaAnalisada = { numero: number; bruto: Bruto; resultado: LinhaNormalizada };

export type Analise = {
  delimitador: string;
  cabecalho: string[];
  mapeamento: Mapeamento;
  /** Se o mapeamento foi sugerido pelo sistema (e não informado por quem importa). */
  sugerido: boolean;
  /** Impedem a importação. Com problemas, `linhas` vem vazia. */
  problemas: string[];
  linhas: LinhaAnalisada[];
  hash: string;
};

/** Lê o CSV e normaliza cada linha. Não toca no banco. */
export function analisarArquivo(conteudo: string, mapeamentoInformado?: Partial<Record<string, string | null>> | null): Analise {
  const csv = lerCsv(conteudo);
  const hash = createHash("sha256").update(conteudo).digest("hex");
  const sugerido = !mapeamentoInformado;
  const { mapeamento, erros } = sugerido
    ? (() => {
        const m = sugerirMapeamento(csv.cabecalho);
        return { mapeamento: m, erros: m.razaoSocial || m.nomeFantasia ? [] : ["não achei a coluna da razão social ou do nome fantasia: ligue uma delas"] };
      })()
    : validarMapeamento(mapeamentoInformado, csv.cabecalho);

  if (erros.length) {
    return { delimitador: csv.delimitador, cabecalho: csv.cabecalho, mapeamento, sugerido, problemas: erros, linhas: [], hash };
  }

  const linhas = csv.linhas.map(({ numero, celulas }): LinhaAnalisada => {
    const extras = celulas.slice(csv.cabecalho.length).some((c) => c.trim() !== "");
    const bruto = extrairBruto(csv.cabecalho, celulas, mapeamento);
    if (extras) {
      return { numero, bruto, resultado: { ok: false, erros: ["a linha tem mais colunas que o cabeçalho (confira aspas e separadores)"], avisos: [] } };
    }
    return { numero, bruto, resultado: normalizarLinha(bruto) };
  });
  return { delimitador: csv.delimitador, cabecalho: csv.cabecalho, mapeamento, sugerido, problemas: [], linhas, hash };
}

/* ----------------------------------------------------- Empresas conhecidas ---- */

const CAMPOS_CONHECIDA = {
  id: true, cnpj: true, razaoSocial: true, nomeFantasia: true, telefone: true, email: true, site: true, dominio: true,
  emailDominio: true, uf: true, cidade: true, segmento: true, porte: true, cnae: true, chaveNome: true, importacaoOrigemId: true,
} as const;

const em = <T,>(lista: T[], tamanho = 500): T[][] => {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) partes.push(lista.slice(i, i + tamanho));
  return partes;
};

/** Empresas do tenant que podem ser duplicatas das linhas dadas, pelo CNPJ, domínio ou nome. */
export async function carregarConhecidas(tenantId: string, empresas: Pick<EmpresaNormalizada, "cnpj" | "dominio" | "chaveNome">[]): Promise<EmpresaConhecida[]> {
  const cnpjs = [...new Set(empresas.map((e) => e.cnpj).filter((v): v is string => !!v))];
  const dominios = [...new Set(empresas.map((e) => e.dominio).filter((v): v is string => !!v))];
  const nomes = [...new Set(empresas.map((e) => e.chaveNome).filter(Boolean))];
  const achadas = new Map<string, EmpresaConhecida>();
  const buscar = async (where: Prisma.SdrEmpresaWhereInput) => {
    for (const e of await prisma.sdrEmpresa.findMany({ where: { tenantId, ...where }, select: CAMPOS_CONHECIDA })) achadas.set(e.id, e);
  };
  for (const parte of em(cnpjs)) await buscar({ cnpj: { in: parte } });
  for (const parte of em(dominios)) await buscar({ dominio: { in: parte } });
  for (const parte of em(nomes)) await buscar({ chaveNome: { in: parte } });
  return [...achadas.values()];
}

/* -------------------------------------------------------------- Prévia ---- */

export type ResumoDuplicada = { numero: number; nome: string; por: string; noArquivo: boolean; mudancas: number; conflitos: number };

export type Previa = {
  delimitador: string;
  cabecalho: string[];
  mapeamento: Mapeamento;
  sugerido: boolean;
  problemas: string[];
  hash: string;
  totais: { linhas: number; novas: number; atualizacoes: number; duplicadas: number; invalidas: number; suprimidas: number; comAviso: number };
  invalidas: { numero: number; erros: string[] }[];
  duplicadas: ResumoDuplicada[];
  novas: { numero: number; nome: string; cnpj: string | null; avisos: string[] }[];
  arquivoJaImportado: { id: string; criadaEm: Date } | null;
};

const nomeDaEmpresa = (e: Pick<EmpresaNormalizada, "razaoSocial" | "nomeFantasia">) => e.razaoSocial ?? e.nomeFantasia ?? "";
const AMOSTRA = 25;

/** Mostra o que a importação faria, sem gravar nada. Usa a mesma regra de duplicidade do worker. */
export async function previa(tenantId: string, conteudo: string, mapeamento?: Partial<Record<string, string | null>> | null): Promise<Previa> {
  const analise = analisarArquivo(conteudo, mapeamento);
  const base = {
    delimitador: analise.delimitador,
    cabecalho: analise.cabecalho,
    mapeamento: analise.mapeamento,
    sugerido: analise.sugerido,
    problemas: analise.problemas,
    hash: analise.hash,
  };
  const vazia = { linhas: analise.linhas.length, novas: 0, atualizacoes: 0, duplicadas: 0, invalidas: 0, suprimidas: 0, comAviso: 0 };
  if (analise.problemas.length) return { ...base, totais: vazia, invalidas: [], duplicadas: [], novas: [], arquivoJaImportado: null };

  const validas = analise.linhas.flatMap((l) => (l.resultado.ok ? [{ ...l, empresa: l.resultado.empresa }] : []));
  const indice = new IndiceDeEmpresas(await carregarConhecidas(tenantId, validas.map((v) => v.empresa)));
  const listas = await carregarListas(tenantId);

  const totais = { ...vazia };
  const invalidas: Previa["invalidas"] = [];
  const duplicadas: ResumoDuplicada[] = [];
  const novas: Previa["novas"] = [];

  for (const l of analise.linhas) {
    if (!l.resultado.ok) {
      totais.invalidas++;
      if (invalidas.length < AMOSTRA) invalidas.push({ numero: l.numero, erros: l.resultado.erros });
      continue;
    }
    const e = l.resultado.empresa;
    if (l.resultado.avisos.length) totais.comAviso++;
    if (bloqueiosDaEmpresa(e, listas).length) totais.suprimidas++;

    const achado = indice.achar(e);
    if (!achado) {
      totais.novas++;
      if (novas.length < AMOSTRA) novas.push({ numero: l.numero, nome: nomeDaEmpresa(e), cnpj: e.cnpj, avisos: l.resultado.avisos });
      // A empresa "virtual" faz a próxima linha igual ser vista como duplicata.
      indice.adicionar({ ...e, id: `arquivo:${l.numero}`, importacaoOrigemId: "arquivo" });
      continue;
    }
    const mesclagem = mesclarPreenchendoVazios(achado.empresa, e);
    const noArquivo = achado.empresa.importacaoOrigemId === "arquivo";
    if (mesclagem.mudancas.length) {
      totais.atualizacoes++;
      // Refletir o preenchimento para as linhas seguintes verem o mesmo estado que o worker verá.
      Object.assign(achado.empresa, mesclagem.atualizacao);
      indice.reindexar(achado.empresa);
    } else {
      totais.duplicadas++;
    }
    if (duplicadas.length < AMOSTRA) {
      duplicadas.push({ numero: l.numero, nome: nomeDaEmpresa(e), por: achado.por, noArquivo, mudancas: mesclagem.mudancas.length, conflitos: mesclagem.conflitos.length });
    }
  }

  const anterior = await prisma.sdrImportacao.findFirst({
    where: { tenantId, hashArquivo: analise.hash },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  return { ...base, totais, invalidas, duplicadas, novas, arquivoJaImportado: anterior ? { id: anterior.id, criadaEm: anterior.createdAt } : null };
}

/* ------------------------------------------------------- Criar importação ---- */

export type NovaImportacao = {
  nomeArquivo: string;
  conteudo: string;
  mapeamento?: Partial<Record<string, string | null>> | null;
  campanhaId?: string | null;
  chave?: string | null;
};

const nomeSeguro = (nome: string) => nome.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 150) || "arquivo.csv";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Registra a importação e as linhas, e põe o processamento na fila. As linhas
 * inválidas já nascem rejeitadas; as demais esperam o worker. Repetir a mesma
 * `chave` devolve a importação que já existe.
 */
export async function criarImportacao(tenantId: string, autor: { id: string; name: string }, d: NovaImportacao) {
  const chave = d.chave?.trim() ? d.chave.trim().slice(0, 100) : randomUUID();
  const existente = await prisma.sdrImportacao.findUnique({ where: { tenantId_chave: { tenantId, chave } } });
  if (existente) return { importacao: existente, duplicada: true };

  const analise = analisarArquivo(d.conteudo, d.mapeamento);
  if (analise.problemas.length) throw new ErroSdrCore(analise.problemas[0], 400);

  if (d.campanhaId) await carregarAlvo(tenantId, d.campanhaId);

  const invalidas = analise.linhas.filter((l) => !l.resultado.ok).length;
  const pendentes = analise.linhas.length - invalidas;

  try {
    const importacao = await prisma.$transaction(
      async (tx) => {
        const criada = await tx.sdrImportacao.create({
          data: {
            tenantId,
            chave,
            nomeArquivo: nomeSeguro(d.nomeArquivo),
            hashArquivo: analise.hash,
            campanhaId: d.campanhaId || null,
            mapeamento: json(analise.mapeamento),
            delimitador: analise.delimitador,
            status: pendentes > 0 ? "PENDENTE" : "CONCLUIDA",
            totalLinhas: analise.linhas.length,
            invalidas,
            pendentes,
            concluidaEm: pendentes > 0 ? null : new Date(),
            criadoPorId: autor.id,
            criadoPorNome: autor.name,
          },
        });
        for (const parte of em(analise.linhas, 500)) {
          await tx.sdrImportacaoLinha.createMany({
            data: parte.map((l) => ({
              tenantId,
              importacaoId: criada.id,
              numero: l.numero,
              status: l.resultado.ok ? ("PENDENTE" as const) : ("INVALIDA" as const),
              bruto: json(l.bruto),
              normalizado: l.resultado.ok ? json(l.resultado.empresa) : Prisma.JsonNull,
              erros: l.resultado.ok ? [] : l.resultado.erros,
              avisos: l.resultado.avisos,
            })),
          });
        }
        if (pendentes > 0) {
          await tx.sdrTrabalho.create({
            data: {
              tenantId,
              tipo: "IMPORTAR",
              chave: `importar:${criada.id}:1`,
              payload: json({ importacaoId: criada.id }),
              maxTentativas: LIMITES.tentativasDoTrabalho,
              proximaTentativaEm: new Date(),
            },
          });
        }
        return criada;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
    return { importacao, duplicada: false };
  } catch (e) {
    // Dois envios com a mesma chave ao mesmo tempo: o segundo devolve o primeiro.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const outra = await prisma.sdrImportacao.findUnique({ where: { tenantId_chave: { tenantId, chave } } });
      if (outra) return { importacao: outra, duplicada: true };
    }
    throw e;
  }
}

/* --------------------------------------------------------- Processamento ---- */

export type ContextoDeProcessamento = {
  /** Estende a reserva do trabalho. Falso = o trabalho foi tomado de outro worker. */
  renovar: () => Promise<boolean>;
  lote?: number;
  linhasPorExecucao?: number;
};

export type ResultadoDeProcessamento = { concluido: boolean; processadas: number };

/** Recalcula os contadores da importação a partir das linhas, que são a fonte da verdade. */
export async function recontar(tenantId: string, importacaoId: string) {
  const grupos = await prisma.sdrImportacaoLinha.groupBy({ by: ["status"], where: { tenantId, importacaoId }, _count: { _all: true } });
  const n = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  const contagem = {
    invalidas: n("INVALIDA"),
    importadas: n("IMPORTADA"),
    atualizadas: n("ATUALIZADA"),
    duplicadas: n("DUPLICADA"),
    falhas: n("FALHOU"),
    pendentes: n("PENDENTE"),
  };
  await prisma.sdrImportacao.updateMany({ where: { id: importacaoId, tenantId }, data: contagem });
  return contagem;
}

/** O estado da empresa que a linha vai deixar no banco, para qualificar sem reler. */
type Desfecho = {
  status: "IMPORTADA" | "ATUALIZADA" | "DUPLICADA";
  empresa: EmpresaConhecida;
  duplicadaPor: string | null;
  mudancas: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  conflitos: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  suprimida: boolean;
};

async function processarLinha(
  tenantId: string,
  importacaoId: string,
  linha: { id: string; normalizado: Prisma.JsonValue },
  indice: IndiceDeEmpresas,
  listas: Awaited<ReturnType<typeof carregarListas>>,
  alvo: AlvoDeQualificacao | null
): Promise<Desfecho> {
  const n = linha.normalizado as unknown as EmpresaNormalizada;
  const achado = indice.achar(n);

  const desfecho = await prisma.$transaction(
    async (tx) => {
      let status: Desfecho["status"];
      let empresa: EmpresaConhecida;
      let duplicadaPor: string | null = null;
      let mudancas: Desfecho["mudancas"] = Prisma.JsonNull;
      let conflitos: Desfecho["conflitos"] = Prisma.JsonNull;

      if (!achado) {
        const criada = await tx.sdrEmpresa.create({ data: { ...n, tenantId, origem: "CSV", importacaoOrigemId: importacaoId }, select: CAMPOS_CONHECIDA });
        status = "IMPORTADA";
        empresa = criada;
      } else {
        const m = mesclarPreenchendoVazios(achado.empresa, n);
        duplicadaPor = `${achado.por}|${achado.empresa.importacaoOrigemId === importacaoId ? "ARQUIVO" : "BASE"}`;
        if (m.conflitos.length) conflitos = m.conflitos as unknown as Prisma.InputJsonValue;
        if (m.mudancas.length) {
          // Só campos que estavam vazios: valor existente nunca é sobrescrito.
          await tx.sdrEmpresa.updateMany({ where: { id: achado.empresa.id, tenantId }, data: m.atualizacao });
          mudancas = m.mudancas as unknown as Prisma.InputJsonValue;
          status = "ATUALIZADA";
        } else {
          status = "DUPLICADA";
        }
        empresa = { ...achado.empresa, ...m.atualizacao };
      }

      const suprimida = bloqueiosDaEmpresa(empresa, listas).length > 0;
      // Empresa na lista de supressão não entra em campanha nem é qualificada.
      if (alvo && !suprimida) {
        const q = qualificar(empresa, alvo.perfil);
        const dados = {
          icpId: alvo.icpId,
          status: q.status,
          pontuacao: q.pontuacao,
          cobertura: q.cobertura,
          criterios: json(q.criterios),
          qualificadoEm: new Date(),
        };
        await tx.sdrProspecto.upsert({
          where: { tenantId_empresaId_campanhaId: { tenantId, empresaId: empresa.id, campanhaId: alvo.campanhaId } },
          create: { ...dados, tenantId, empresaId: empresa.id, campanhaId: alvo.campanhaId, importacaoOrigemId: importacaoId },
          update: dados,
        });
      }

      await tx.sdrImportacaoLinha.updateMany({
        where: { id: linha.id, tenantId },
        data: { status, empresaId: empresa.id, duplicadaPor, mudancas, conflitos, suprimida, processadaEm: new Date(), erroProcessamento: null },
      });
      return { status, empresa, duplicadaPor, mudancas, conflitos, suprimida } satisfies Desfecho;
    },
    { timeout: 20_000, maxWait: 10_000 }
  );

  // O índice só muda depois de a transação confirmar.
  indice.adicionar(desfecho.empresa);
  return desfecho;
}

/** Texto curto e sem dados da linha, para guardar o motivo de uma falha. */
export function descreverErro(e: unknown): string {
  if (e instanceof ErroSdrCore) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) return `erro de banco ${e.code}`;
  return e instanceof Error ? `erro inesperado (${e.name})` : "erro inesperado";
}

/**
 * Processa as linhas pendentes em lotes. Cada linha é uma transação própria: ou
 * a empresa, o prospecto e o status da linha mudam juntos, ou nada muda. Por
 * isso reprocessar é seguro e o trabalho pode ser retomado de onde parou.
 */
export async function processarImportacao(tenantId: string, importacaoId: string, ctx: ContextoDeProcessamento): Promise<ResultadoDeProcessamento> {
  const imp = await prisma.sdrImportacao.findFirst({ where: { id: importacaoId, tenantId } });
  if (!imp) throw new ErroSdrCore("importação não encontrada", 404);

  await prisma.sdrImportacao.updateMany({ where: { id: imp.id, tenantId }, data: { status: "PROCESSANDO", iniciadaEm: imp.iniciadaEm ?? new Date(), erro: null } });

  // Campanha apagada depois da importação: segue sem associar.
  let alvo: AlvoDeQualificacao | null = null;
  if (imp.campanhaId) {
    try {
      alvo = await carregarAlvo(tenantId, imp.campanhaId);
    } catch (e) {
      if (!(e instanceof ErroSdrCore && e.status === 404)) throw e;
    }
  }

  const tamanhoDoLote = ctx.lote ?? LIMITES.loteDeLinhas;
  const maxLinhas = ctx.linhasPorExecucao ?? LIMITES.linhasPorExecucao;
  let processadas = 0;

  for (;;) {
    const lote = await prisma.sdrImportacaoLinha.findMany({
      where: { tenantId, importacaoId: imp.id, status: "PENDENTE" },
      orderBy: { numero: "asc" },
      take: tamanhoDoLote,
      select: { id: true, numero: true, normalizado: true },
    });
    if (lote.length === 0) break;

    const listas = await carregarListas(tenantId);
    const indice = new IndiceDeEmpresas(await carregarConhecidas(tenantId, lote.map((l) => l.normalizado as unknown as EmpresaNormalizada)));

    for (const linha of lote) {
      try {
        await processarLinha(tenantId, imp.id, linha, indice, listas, alvo);
      } catch (e) {
        await prisma.sdrImportacaoLinha.updateMany({
          where: { id: linha.id, tenantId },
          data: { status: "FALHOU", tentativas: { increment: 1 }, erroProcessamento: descreverErro(e), processadaEm: new Date() },
        });
      }
      processadas++;
    }

    await recontar(tenantId, imp.id);
    if (!(await ctx.renovar())) throw new ErroSdrCore("a reserva do trabalho foi perdida", 409);
    if (processadas >= maxLinhas) return { concluido: false, processadas };
  }

  const c = await recontar(tenantId, imp.id);
  await prisma.sdrImportacao.updateMany({
    where: { id: imp.id, tenantId },
    data: { status: c.falhas > 0 ? "CONCLUIDA_COM_ERROS" : "CONCLUIDA", concluidaEm: new Date() },
  });
  return { concluido: true, processadas };
}

/** O trabalho da importação esgotou as tentativas: a importação não fica "processando" para sempre. */
export async function marcarImportacaoFalhou(tenantId: string, importacaoId: string, motivo: string) {
  await prisma.sdrImportacao.updateMany({
    where: { id: importacaoId, tenantId, status: { in: ["PENDENTE", "PROCESSANDO"] } },
    data: { status: "FALHOU", erro: motivo.slice(0, 500) },
  });
}

/* ----------------------------------------------------- Consulta e reprocesso ---- */

export async function reprocessarImportacao(tenantId: string, importacaoId: string) {
  const imp = await prisma.sdrImportacao.findFirst({ where: { id: importacaoId, tenantId }, select: { id: true } });
  if (!imp) throw new ErroSdrCore("importação não encontrada", 404);

  const prefixo = `importar:${imp.id}:`;
  const ativo = await prisma.sdrTrabalho.findFirst({
    where: { tenantId, tipo: "IMPORTAR", chave: { startsWith: prefixo }, status: { in: ["PENDENTE", "EM_PROCESSAMENTO"] } },
    select: { id: true },
  });
  if (ativo) return { trabalhoId: ativo.id, jaNaFila: true, liberadas: 0, pendentes: 0 };

  const { count: liberadas } = await prisma.sdrImportacaoLinha.updateMany({
    where: { tenantId, importacaoId: imp.id, status: "FALHOU", tentativas: { lt: LIMITES.tentativasDaLinha } },
    data: { status: "PENDENTE", erroProcessamento: null },
  });
  const pendentes = await prisma.sdrImportacaoLinha.count({ where: { tenantId, importacaoId: imp.id, status: "PENDENTE" } });
  if (pendentes === 0) {
    await recontar(tenantId, imp.id);
    return { trabalhoId: null, jaNaFila: false, liberadas, pendentes };
  }

  const numero = (await prisma.sdrTrabalho.count({ where: { tenantId, tipo: "IMPORTAR", chave: { startsWith: prefixo } } })) + 1;
  await prisma.sdrImportacao.updateMany({ where: { id: imp.id, tenantId }, data: { status: "PENDENTE", erro: null, concluidaEm: null } });
  const { trabalho } = await enfileirar(tenantId, "IMPORTAR", `${prefixo}${numero}`, { importacaoId: imp.id });
  await recontar(tenantId, imp.id);
  return { trabalhoId: trabalho.id, jaNaFila: false, liberadas, pendentes };
}

export async function listarImportacoes(tenantId: string) {
  const itens = await prisma.sdrImportacao.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 });
  const campanhaIds = [...new Set(itens.map((i) => i.campanhaId).filter((v): v is string => !!v))];
  const campanhas = campanhaIds.length ? await prisma.sdrCampanha.findMany({ where: { tenantId, id: { in: campanhaIds } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(campanhas.map((c) => [c.id, c.nome]));
  return itens.map((i) => ({ ...i, campanhaNome: i.campanhaId ? (nomes.get(i.campanhaId) ?? null) : null }));
}

export async function obterImportacao(tenantId: string, id: string) {
  const imp = await prisma.sdrImportacao.findFirst({ where: { id, tenantId } });
  if (!imp) throw new ErroSdrCore("importação não encontrada", 404);
  const [trabalho, campanha] = await Promise.all([
    prisma.sdrTrabalho.findFirst({
      where: { tenantId, tipo: "IMPORTAR", chave: { startsWith: `importar:${id}:` } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, tentativas: true, maxTentativas: true, erro: true, proximaTentativaEm: true, concluidoEm: true },
    }),
    imp.campanhaId ? prisma.sdrCampanha.findFirst({ where: { id: imp.campanhaId, tenantId }, select: { nome: true } }) : null,
  ]);
  return { ...imp, campanhaNome: campanha?.nome ?? null, trabalho };
}

export type FiltroDeLinhas = { status?: string; pagina?: number };

export async function listarLinhas(tenantId: string, importacaoId: string, filtro: FiltroDeLinhas = {}) {
  const imp = await prisma.sdrImportacao.findFirst({ where: { id: importacaoId, tenantId }, select: { id: true } });
  if (!imp) throw new ErroSdrCore("importação não encontrada", 404);
  const where: Prisma.SdrImportacaoLinhaWhereInput = { tenantId, importacaoId };
  if (filtro.status === "SUPRIMIDA") where.suprimida = true;
  else if (filtro.status === "CONFLITO") where.conflitos = { not: Prisma.JsonNull };
  else if (filtro.status) where.status = filtro.status as Prisma.SdrImportacaoLinhaWhereInput["status"];
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const [itens, total] = await Promise.all([
    prisma.sdrImportacaoLinha.findMany({
      where,
      orderBy: { numero: "asc" },
      skip: (pagina - 1) * LIMITES.tamanhoDaPagina,
      take: LIMITES.tamanhoDaPagina,
      select: {
        id: true, numero: true, status: true, bruto: true, erros: true, avisos: true, empresaId: true, duplicadaPor: true,
        mudancas: true, conflitos: true, suprimida: true, tentativas: true, erroProcessamento: true,
      },
    }),
    prisma.sdrImportacaoLinha.count({ where }),
  ]);
  return { itens, total, pagina, tamanho: LIMITES.tamanhoDaPagina };
}
