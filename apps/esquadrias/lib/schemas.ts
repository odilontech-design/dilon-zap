import { z } from "zod";

/**
 * Schemas de validação compartilhados.
 *
 * Ficam fora dos `route.ts` porque o Next só aceita handlers HTTP como export
 * de um arquivo de rota — exportar o schema de lá quebra o build. E eles
 * PRECISAM ser compartilhados: a rota de criar e a de editar validam o mesmo
 * objeto, e duas cópias divergem no primeiro campo novo.
 */

export const schemaPerfil = z.object({
  codigo: z.string().trim().min(1).max(30),
  nome: z.string().trim().min(2).max(120),
  linhaId: z.string().trim().nullish(),
  /** kg/m — é o dado da tabela do fornecedor e o que define o custo da peça. */
  pesoPorMetro: z.number().min(0.001).max(50),
  precoPorKgCentavos: z.number().int().min(1),
  comprimentoBarraMm: z.number().int().min(500).max(12000).default(6000),
  estoqueBarras: z.number().min(0).default(0),
  ativo: z.boolean().default(true),
});

export const schemaVidro = z.object({
  nome: z.string().trim().min(2).max(120),
  tipo: z.string().trim().max(40).default("INCOLOR"),
  espessuraMm: z.number().min(1).max(30),
  precoM2Centavos: z.number().int().min(1),
  /** Metragem mínima cobrada pela vidraçaria — chapa pequena sai como 1 m². */
  m2Minimo: z.number().min(0).max(10).default(0),
  temperado: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const schemaFerragem = z.object({
  codigo: z.string().trim().max(30).nullish(),
  nome: z.string().trim().min(2).max(120),
  unidade: z.string().trim().max(10).default("pç"),
  precoUnitarioCentavos: z.number().int().min(0),
  estoque: z.number().min(0).default(0),
  ativo: z.boolean().default(true),
});

export const schemaCor = z.object({
  nome: z.string().trim().min(2).max(60),
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "use o formato #RRGGBB").default("#CCCCCC"),
  /** Multiplicador do preço do alumínio. Anodizado e amadeirado custam mais. */
  fatorAluminio: z.number().min(0.1).max(10).default(1),
  fatorFerragem: z.number().min(0.1).max(10).default(1),
  ativa: z.boolean().default(true),
  ordem: z.number().int().min(0).default(0),
});

export const schemaCliente = z.object({
  nome: z.string().trim().min(2).max(160),
  tipo: z.enum(["FISICA", "JURIDICA"]).default("FISICA"),
  documento: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  telefone: z.string().trim().max(40).optional(),
  endereco: z.string().trim().max(200).optional(),
  numero: z.string().trim().max(20).optional(),
  bairro: z.string().trim().max(80).optional(),
  cidade: z.string().trim().max(80).optional(),
  uf: z.string().trim().max(2).optional(),
  cep: z.string().trim().max(12).optional(),
  observacoes: z.string().trim().max(2000).optional(),
});

export const schemaItemOrcamento = z.object({
  tipologiaId: z.string().trim().min(1),
  descricao: z.string().trim().max(160).optional(),
  larguraMm: z.number().int().min(50).max(20000),
  alturaMm: z.number().int().min(50).max(20000),
  quantidade: z.number().int().min(1).max(999),
  ambiente: z.string().trim().max(120).nullish(),
  observacoes: z.string().trim().max(2000).nullish(),
  corAluminioId: z.string().trim().nullish(),
  corFerragemId: z.string().trim().nullish(),
  margemLucroPercent: z.number().min(0).max(1000).nullish(),
  acrescimoCentavos: z.number().int().min(0).default(0),
  descontoCentavos: z.number().int().min(0).default(0),
  adicionaisCentavos: z.number().int().min(0).default(0),
  parametros: z.record(z.number()).nullish(),
});

const schemaPecaTipologia = z.object({
  perfilId: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(120),
  corte: z.enum(["RETO", "ANGULO_45", "ANGULO_45_DUPLO"]).default("RETO"),
  formulaQuantidade: z.string().trim().min(1).max(200),
  formulaComprimento: z.string().trim().min(1).max(200),
});

const schemaVidroTipologia = z.object({
  vidroId: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(120),
  formulaQuantidade: z.string().trim().min(1).max(200),
  formulaLargura: z.string().trim().min(1).max(200),
  formulaAltura: z.string().trim().min(1).max(200),
});

const schemaFerragemTipologia = z.object({
  ferragemId: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(120),
  formulaQuantidade: z.string().trim().min(1).max(200),
});

export const schemaTipologia = z.object({
  nome: z.string().trim().min(2).max(120),
  categoria: z.enum(["JANELA", "PORTA", "BOX", "GUARDA_CORPO", "FACHADA", "VITRINE", "OUTRO"]).default("JANELA"),
  descricao: z.string().trim().max(1000).nullish(),
  linhaId: z.string().trim().nullish(),
  desenhoSvg: z.string().trim().max(20000).nullish(),
  larguraMinMm: z.number().int().min(50).max(20000).default(300),
  larguraMaxMm: z.number().int().min(50).max(20000).default(6000),
  alturaMinMm: z.number().int().min(50).max(20000).default(300),
  alturaMaxMm: z.number().int().min(50).max(20000).default(6000),
  parametros: z
    .array(
      z.object({
        chave: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "use letras, números e _"),
        rotulo: z.string().trim().min(1).max(80),
        valorPadrao: z.number(),
      }),
    )
    .default([]),
  pecas: z.array(schemaPecaTipologia).default([]),
  vidros: z.array(schemaVidroTipologia).default([]),
  ferragens: z.array(schemaFerragemTipologia).default([]),
});

export type DadosTipologia = z.infer<typeof schemaTipologia>;
