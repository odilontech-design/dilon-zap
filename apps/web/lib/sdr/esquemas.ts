import { z } from "zod";

/**
 * O que as rotas do SDR aceitam. Todos são `.strict()`: um `tenantId` enviado
 * pelo navegador é recusado, e não apenas ignorado. O tenant vem da sessão.
 */

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const PORTES = ["MEI", "ME", "EPP", "MEDIA", "GRANDE"] as const;

export const ROTULO_PORTE: Record<(typeof PORTES)[number], string> = {
  MEI: "MEI",
  ME: "Microempresa",
  EPP: "Pequeno porte",
  MEDIA: "Média",
  GRANDE: "Grande",
};

export const STATUS_CAMPANHA = ["RASCUNHO", "ATIVA", "PAUSADA", "ENCERRADA"] as const;

export const ROTULO_STATUS_CAMPANHA: Record<(typeof STATUS_CAMPANHA)[number], string> = {
  RASCUNHO: "Rascunho",
  ATIVA: "Ativa",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
};

const lista = (max: number, tamanho = 80) => z.array(z.string().trim().min(1).max(tamanho)).max(max);

export const criterioSchema = z
  .object({
    nome: z.string().trim().min(1).max(80),
    descricao: z.string().trim().max(300).optional(),
    peso: z.number().int().min(1).max(10),
    obrigatorio: z.boolean(),
  })
  .strict();

const camposDoPerfil = {
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(500).nullable(),
  segmentos: lista(30),
  cnaes: z.array(z.string().trim().regex(/^\d{7}$/, "CNAE com 7 dígitos")).max(50),
  ufs: z.array(z.enum(UFS)).max(UFS.length),
  cidades: lista(50),
  portes: z.array(z.enum(PORTES)).max(PORTES.length),
  caracteristicas: lista(30, 120),
  criterios: z.array(criterioSchema).max(20),
};

export const criarPerfilSchema = z
  .object({
    nome: camposDoPerfil.nome,
    descricao: camposDoPerfil.descricao.optional(),
    segmentos: camposDoPerfil.segmentos.default([]),
    cnaes: camposDoPerfil.cnaes.default([]),
    ufs: camposDoPerfil.ufs.default([]),
    cidades: camposDoPerfil.cidades.default([]),
    portes: camposDoPerfil.portes.default([]),
    caracteristicas: camposDoPerfil.caracteristicas.default([]),
    criterios: camposDoPerfil.criterios.default([]),
  })
  .strict();

export const editarPerfilSchema = z.object(camposDoPerfil).partial().strict();

export const criarCampanhaSchema = z
  .object({
    nome: z.string().trim().min(2).max(80),
    descricao: z.string().trim().max(500).nullable().optional(),
    icpId: z.string().trim().min(1).max(60),
    status: z.enum(STATUS_CAMPANHA).optional(),
  })
  .strict();

export const editarCampanhaSchema = criarCampanhaSchema.partial().strict();

export type CriarPerfil = z.infer<typeof criarPerfilSchema>;
export type EditarPerfil = z.infer<typeof editarPerfilSchema>;
export type CriarCampanha = z.infer<typeof criarCampanhaSchema>;
export type EditarCampanha = z.infer<typeof editarCampanhaSchema>;

/* ------------------------------------------------- Importação e empresas ---- */

const mapeamentoSchema = z.record(z.string().max(60), z.string().max(200).nullable());

export const previaSchema = z.object({ conteudo: z.string().min(1), mapeamento: mapeamentoSchema.nullable().optional() }).strict();

export const criarImportacaoSchema = z
  .object({
    nomeArquivo: z.string().trim().min(1).max(200),
    conteudo: z.string().min(1),
    mapeamento: mapeamentoSchema.nullable().optional(),
    campanhaId: z.string().trim().min(1).max(60).nullable().optional(),
    chave: z.string().trim().min(8).max(100).optional(),
  })
  .strict();

export const associarSchema = z.object({ empresaIds: z.array(z.string().trim().min(1).max(60)).min(1).max(2000) }).strict();

export const TIPOS_SUPRESSAO = ["CNPJ", "DOMINIO", "EMAIL", "TELEFONE"] as const;
export const MOTIVOS_SUPRESSAO = ["EMPRESA_BLOQUEADA", "SOLICITOU_NAO_CONTATO", "OPOSICAO", "RESTRICAO"] as const;

export const supressaoSchema = z
  .object({
    tipo: z.enum(TIPOS_SUPRESSAO),
    valor: z.string().trim().min(1).max(200),
    motivo: z.enum(MOTIVOS_SUPRESSAO),
    observacao: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

const pagina = z.coerce.number().int().min(1).max(100_000).optional();

export const filtroEmpresasSchema = z
  .object({
    campanhaId: z.string().trim().min(1).max(60).optional(),
    icpId: z.string().trim().min(1).max(60).optional(),
    status: z.enum(["PENDENTE", "QUALIFICADO", "NAO_QUALIFICADO", "VERIFICAR"]).optional(),
    suprimida: z.enum(["sim", "nao"]).optional(),
    busca: z.string().trim().max(100).optional(),
    uf: z.enum(UFS).optional(),
    cidade: z.string().trim().min(1).max(80).optional(),
    segmento: z.string().trim().min(1).max(80).optional(),
    telefone: z.enum(["sim", "nao"]).optional(),
    email: z.enum(["sim", "nao"]).optional(),
    ordem: z.enum(["pontuacao", "data", "prontas", "acao", "prioridade"]).optional(),
    etapa: z.enum(["NAO_CONTATADA", "CONTATADA", "RESPONDEU", "INTERESSE", "INFO_SOLICITADA", "REUNIAO", "SEM_INTERESSE", "NAO_CONTATAR", "CONVERTIDA"]).optional(),
    produto: z.enum(["DILON_ZAP", "DILON_FACILITIES"]).optional(),
    prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).optional(),
    visao: z.enum(["disponiveis", "preparadas", "aprovadas", "contatadas", "responderam", "followup", "convertidas", "encerradas"]).optional(),
    acaoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))).optional(),
    pagina,
  })
  .strict();

/** O painel só aceita os filtros que mudam a leitura dos números. */
export const filtroPainelSchema = z
  .object({
    campanhaId: z.string().trim().min(1).max(60).optional(),
    icpId: z.string().trim().min(1).max(60).optional(),
    uf: z.enum(UFS).optional(),
    cidade: z.string().trim().min(1).max(80).optional(),
    segmento: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const filtroLinhasSchema = z
  .object({
    status: z.enum(["PENDENTE", "IMPORTADA", "ATUALIZADA", "DUPLICADA", "INVALIDA", "FALHOU", "SUPRIMIDA", "CONFLITO"]).optional(),
    pagina,
  })
  .strict();
