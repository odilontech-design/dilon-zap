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
