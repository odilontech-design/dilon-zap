import { prisma } from "@dilon-zap/db";
import { z } from "zod";

/**
 * Configuração da IA por empresa. Nasce desligada e sem orçamento: enquanto alguém do responsável
 * não ligar, definir os limites e informar o preço de cada modelo, nenhuma chamada é feita.
 * Modelos e preços ficam aqui (no banco), e não espalhados pelo código.
 */

export const PROVEDORES = ["anthropic", "gemini"] as const;
export type NomeProvedor = (typeof PROVEDORES)[number];

const referencia = z.string().regex(/^(anthropic|gemini):[A-Za-z0-9._-]{2,80}$/, "use provedor:modelo, com provedor anthropic ou gemini");
const nomeDeTarefa = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/, "tarefa em minúsculas, números e _");

export const configIaSchema = z
  .object({
    ativa: z.boolean(),
    /** Micro-dólar: 1 US$ = 1.000.000. */
    orcamentoDiarioMicro: z.number().int().min(0).max(100_000_000).nullable(),
    orcamentoMensalMicro: z.number().int().min(0).max(2_000_000_000).nullable(),
    limiteTokensEntrada: z.number().int().min(100).max(100_000),
    limiteTokensSaida: z.number().int().min(50).max(8_000),
    cacheHoras: z.number().int().min(0).max(720),
    modelos: z.record(nomeDeTarefa, z.object({ principal: referencia, reserva: referencia.optional() }).strict()),
    precos: z.record(referencia, z.object({ entradaMicroPorMilTokens: z.number().int().min(0).max(100_000_000), saidaMicroPorMilTokens: z.number().int().min(0).max(100_000_000) }).strict()),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (Object.keys(c.modelos).length > 30) ctx.addIssue({ code: "custom", path: ["modelos"], message: "tarefas demais" });
    if (Object.keys(c.precos).length > 30) ctx.addIssue({ code: "custom", path: ["precos"], message: "modelos demais" });
  });

export type ConfigIa = z.infer<typeof configIaSchema>;

export const CONFIG_PADRAO: ConfigIa = {
  ativa: false,
  orcamentoDiarioMicro: null,
  orcamentoMensalMicro: null,
  limiteTokensEntrada: 8_000,
  limiteTokensSaida: 1_000,
  cacheHoras: 24,
  modelos: {},
  precos: {},
};

/** Sem linha, ou com linha que não passa mais na validação, vale o padrão desligado. */
export async function obterConfigIa(tenantId: string): Promise<ConfigIa> {
  const linha = await prisma.sdrIaConfig.findUnique({ where: { tenantId } });
  if (!linha) return CONFIG_PADRAO;
  const lida = configIaSchema.safeParse({
    ativa: linha.ativa,
    orcamentoDiarioMicro: linha.orcamentoDiarioMicro,
    orcamentoMensalMicro: linha.orcamentoMensalMicro,
    limiteTokensEntrada: linha.limiteTokensEntrada,
    limiteTokensSaida: linha.limiteTokensSaida,
    cacheHoras: linha.cacheHoras,
    modelos: linha.modelos,
    precos: linha.precos,
  });
  return lida.success ? lida.data : CONFIG_PADRAO;
}

export async function salvarConfigIa(tenantId: string, dados: ConfigIa, autor: { id: string; name: string }): Promise<ConfigIa> {
  const c = configIaSchema.parse(dados);
  const valores = { ...c, atualizadoPorId: autor.id, atualizadoPorNome: autor.name };
  await prisma.sdrIaConfig.upsert({ where: { tenantId }, create: { tenantId, ...valores }, update: valores });
  return c;
}

const BRT_MS = 3 * 3_600_000;

/** O dia e o mês do orçamento seguem o horário de Brasília (UTC-3, sem horário de verão). */
export function inicioDoDia(agora: Date): Date {
  const l = new Date(agora.getTime() - BRT_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + BRT_MS);
}

export function inicioDoMes(agora: Date): Date {
  const l = new Date(agora.getTime() - BRT_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) + BRT_MS);
}

export function custoEmMicro(tokensEntrada: number, tokensSaida: number, preco: { entradaMicroPorMilTokens: number; saidaMicroPorMilTokens: number }): number {
  return Math.ceil((tokensEntrada * preco.entradaMicroPorMilTokens + tokensSaida * preco.saidaMicroPorMilTokens) / 1000);
}
