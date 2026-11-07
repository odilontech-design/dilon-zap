import { z } from "zod";

/**
 * Formato do que a tela manda para as rotas da ótica. Os graus já chegam como
 * inteiros (a tela lê "+2,25" com lib/otica-regras e manda 225); aqui só se
 * confere a faixa, para nada absurdo chegar ao papel do laboratório.
 */

const inteiro = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

const olho = z.object({
  esferico: inteiro(-3000, 3000),
  cilindrico: inteiro(-3000, 3000),
  eixo: inteiro(0, 180),
  dnp: inteiro(100, 500),
  altura: inteiro(50, 500),
});

export const grausSchema = z.object({
  longe: z.object({ od: olho, oe: olho }),
  perto: z.object({ od: olho, oe: olho }),
  adicao: z.object({ od: inteiro(0, 1000), oe: inteiro(0, 1000) }),
});

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const data = z.string().datetime().nullable().optional();

export const receitaSchema = z.object({
  usuarioNome: texto(120),
  usuarioNascimento: data,
  medico: texto(120),
  crm: texto(30),
  dataConsulta: data,
  graus: grausSchema,
  observacoes: texto(1000),
});

const medidasSchema = z
  .object({
    ponte: inteiro(50, 400),
    diagonal: inteiro(100, 900),
    horizontal: inteiro(100, 900),
    vertical: inteiro(100, 900),
  })
  .nullable()
  .optional();

/** Dados do cliente que o talão pede e que ficam na ficha do contato. */
export const dadosClienteSchema = z
  .object({
    documento: texto(20),
    rgIe: texto(30),
    nascimento: data,
    email: texto(160),
    cep: texto(10),
    logradouro: texto(160),
    numeroEndereco: texto(20),
    bairro: texto(80),
    cidade: texto(80),
  })
  .optional();

export const camposOS = {
  laboratorioId: z.string().nullable().optional(),
  pedidoLaboratorio: texto(40),
  consultorId: z.string().nullable().optional(),
  // Dia e hora como a atendente digitou, no relógio da loja. O servidor
  // converte com o fuso da empresa (ver instanteNoFuso).
  previsao: z
    .object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hora: z.string().regex(/^(\d{2}:\d{2})?$/) })
    .nullable()
    .optional(),
  lentes: texto(200),
  materialLente: texto(40),
  indiceLente: texto(10),
  tratamentos: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  tratamentoCor: texto(120),
  armacao: texto(200),
  materialArmacao: texto(40),
  servicos: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  medidas: medidasSchema,
  observacoes: texto(2000),
  valorCents: z.number().int().min(0).max(100_000_00).optional(),
  sinalCents: z.number().int().min(0).max(100_000_00).optional(),
  portadorAutorizado: texto(120),
};

export const criarOSSchema = z
  .object({
    contactId: z.string().optional(),
    novoCliente: z.object({ nome: z.string().trim().min(1).max(120), telefone: z.string().min(8).max(20) }).optional(),
    cliente: dadosClienteSchema,
    receitaId: z.string().optional(),
    receita: receitaSchema.nullable().optional(),
    ...camposOS,
  })
  .refine((d) => d.contactId || d.novoCliente, { message: "escolha o cliente ou cadastre pelo telefone" });

export const editarOSSchema = z.object({
  cliente: dadosClienteSchema,
  receita: receitaSchema.nullable().optional(),
  quitada: z.boolean().optional(),
  ...camposOS,
});

export const etapaSchema = z.object({
  para: z.enum(["ABERTA", "LABORATORIO", "MONTAGEM", "CONFERENCIA", "PRONTA", "ENTREGUE", "CANCELADA"]),
  avisar: z.boolean().default(true),
  motivoCancelamento: z.string().trim().max(300).optional(),
});

export const laboratorioSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  telefone: texto(30),
  contato: texto(80),
  prazoDias: z.number().int().min(0).max(90).nullable().optional(),
  ativo: z.boolean().optional(),
});

export const avisoSchema = z.object({ ativo: z.boolean(), texto: z.string().max(1000) });

export const configSchema = z.object({
  proximoNumeroOS: z.number().int().min(1).max(9_999_999).optional(),
  validadeReceitaMeses: z.number().int().min(1).max(60).optional(),
  avisos: z.record(z.enum(["LABORATORIO", "MONTAGEM", "PRONTA", "ENTREGUE"]), avisoSchema).optional(),
});

/** Converte "2026-11-18T19:00:00.000Z" (ou null/undefined) para Date, mantendo undefined = "não mexer". */
export function paraData(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Date(v);
}

/** Telefone digitado no balcão: "(21) 99186-4736" vira 5521991864736. */
export function telefoneParaWhatsApp(digitado: string): string {
  const d = digitado.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}
