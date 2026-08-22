import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

export const GET = rota(async () => {
  const usuario = await usuarioDaApi();
  return ok(await prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId } }));
});

/**
 * Parâmetros da empresa — o que torna o sistema o mesmo produto pra duas
 * serralherias diferentes. Margem, mão de obra, perda de alumínio, imposto e
 * a espessura da serra são exatamente os números em que uma difere da outra.
 */
const schema = z.object({
  nome: z.string().trim().min(2).max(160).optional(),
  cnpj: z.string().trim().max(20).nullish(),
  telefone: z.string().trim().max(40).nullish(),
  email: z.string().trim().max(160).nullish(),
  endereco: z.string().trim().max(200).nullish(),
  cidade: z.string().trim().max(80).nullish(),
  uf: z.string().trim().max(2).nullish(),
  cep: z.string().trim().max(12).nullish(),
  logoUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  corPrimaria: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  margemLucroPercent: z.number().min(0).max(1000).optional(),
  maoDeObraPorM2Centavos: z.number().int().min(0).optional(),
  maoDeObraPercentSobreCusto: z.number().min(0).max(100).optional(),
  perdaAluminioPercent: z.number().min(0).max(50).optional(),
  impostoPercent: z.number().min(0).max(50).optional(),
  espessuraSerraMm: z.number().int().min(0).max(20).optional(),
  sobraMinimaAproveitavelMm: z.number().int().min(0).max(3000).optional(),
  validadeOrcamentoDias: z.number().int().min(1).max(365).optional(),
  condicoesPadrao: z.string().trim().max(4000).nullish(),
});

export const PATCH = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schema);

  const atualizada = await prisma.empresa.update({
    where: { id: usuario.empresaId },
    data: { ...dados, logoUrl: dados.logoUrl || null },
  });

  await registrar(usuario, "empresa.configurada", { entidade: "Empresa", entidadeId: usuario.empresaId, detalhe: { campos: Object.keys(dados) } });
  return ok(atualizada);
});
