import { z } from "zod";
import { expandirTipologia, precificarItem } from "@dilon-zap/esquadrias-core";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { carregarTipologia, paraMotor, regrasDaEmpresa } from "@/lib/calculo";

/**
 * Cálculo sem gravar nada.
 *
 * É o que faz a janela de "adicionar produto" mostrar custo, lucro e total
 * mudando enquanto o vendedor arrasta a medida — sem criar item de rascunho
 * no banco a cada tecla. O cálculo roda no SERVIDOR porque a fórmula da
 * tipologia e o preço do kg são da empresa: mandar isso pro navegador
 * entregaria a tabela de custo a qualquer um com o DevTools aberto.
 */
const schema = z.object({
  tipologiaId: z.string().trim().min(1),
  larguraMm: z.number().int().min(50).max(20000),
  alturaMm: z.number().int().min(50).max(20000),
  quantidade: z.number().int().min(1).max(999),
  corAluminioId: z.string().trim().nullish(),
  corFerragemId: z.string().trim().nullish(),
  margemLucroPercent: z.number().min(0).max(1000).nullish(),
  acrescimoCentavos: z.number().int().min(0).default(0),
  descontoCentavos: z.number().int().min(0).default(0),
  adicionaisCentavos: z.number().int().min(0).default(0),
  parametros: z.record(z.number()).nullish(),
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  const [tipologia, empresa] = await Promise.all([
    carregarTipologia(dados.tipologiaId, usuario.empresaId),
    prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId } }),
  ]);
  if (!tipologia) throw new RespostaDeErro(404, "tipologia não encontrada");

  const fora =
    dados.larguraMm < tipologia.larguraMinMm ||
    dados.larguraMm > tipologia.larguraMaxMm ||
    dados.alturaMm < tipologia.alturaMinMm ||
    dados.alturaMm > tipologia.alturaMaxMm;

  const [corAluminio, corFerragem] = await Promise.all([
    dados.corAluminioId ? prisma.cor.findFirst({ where: { id: dados.corAluminioId, empresaId: usuario.empresaId } }) : null,
    dados.corFerragemId ? prisma.cor.findFirst({ where: { id: dados.corFerragemId, empresaId: usuario.empresaId } }) : null,
  ]);

  try {
    const expansao = expandirTipologia(
      paraMotor(tipologia),
      {
        larguraMm: dados.larguraMm,
        alturaMm: dados.alturaMm,
        quantidade: dados.quantidade,
        parametros: dados.parametros ?? undefined,
      },
      { aluminio: corAluminio?.fatorAluminio ?? 1, ferragem: corFerragem?.fatorFerragem ?? 1 },
    );

    const preco = precificarItem(expansao, regrasDaEmpresa(empresa), {
      margemLucroPercent: dados.margemLucroPercent,
      acrescimoCentavos: dados.acrescimoCentavos,
      descontoCentavos: dados.descontoCentavos,
      adicionaisCentavos: dados.adicionaisCentavos,
    });

    return ok({
      expansao,
      preco,
      // Aviso, e não erro: a simulação continua mostrando o preço mesmo fora
      // do limite. Quem decide se aquela janela de 3,2m é fabricável é a
      // serralheria, não a validação — ela só precisa saber que saiu da faixa.
      aviso: fora
        ? `Fora da faixa da tipologia (largura ${tipologia.larguraMinMm}–${tipologia.larguraMaxMm} mm, altura ${tipologia.alturaMinMm}–${tipologia.alturaMaxMm} mm).`
        : null,
    });
  } catch (err) {
    throw new RespostaDeErro(400, err instanceof Error ? err.message : "não foi possível calcular");
  }
});
