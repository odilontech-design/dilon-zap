import { z } from "zod";
import { expandirTipologia, type Tipologia as TipologiaMotor } from "@dilon-zap/esquadrias-core";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { schemaTipologia } from "@/lib/schemas";

/**
 * Testa uma tipologia AINDA NÃO SALVA.
 *
 * É o que separa cadastrar tipologia de adivinhar: a pessoa escreve
 * `L - 2 * folga`, informa um vão de teste e vê a lista de cortes na hora.
 * Sem isso, o único jeito de descobrir que a fórmula está errada é salvar,
 * montar um orçamento e conferir peça por peça — e ninguém faz isso, então a
 * fórmula errada só aparece na serra.
 */
const schema = z.object({
  tipologia: schemaTipologia,
  larguraMm: z.number().int().min(50).max(20000),
  alturaMm: z.number().int().min(50).max(20000),
  quantidade: z.number().int().min(1).max(99).default(1),
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const { tipologia, larguraMm, alturaMm, quantidade } = await corpo(req, schema);

  const [perfis, vidros, ferragens] = await Promise.all([
    prisma.perfil.findMany({ where: { empresaId: usuario.empresaId, id: { in: tipologia.pecas.map((p) => p.perfilId) } } }),
    prisma.vidro.findMany({ where: { empresaId: usuario.empresaId, id: { in: tipologia.vidros.map((v) => v.vidroId) } } }),
    prisma.ferragem.findMany({ where: { empresaId: usuario.empresaId, id: { in: tipologia.ferragens.map((f) => f.ferragemId) } } }),
  ]);

  const porId = <T extends { id: string }>(lista: T[]) => new Map(lista.map((i) => [i.id, i]));
  const mapaPerfil = porId(perfis);
  const mapaVidro = porId(vidros);
  const mapaFerragem = porId(ferragens);

  const motor: TipologiaMotor = {
    id: "rascunho",
    nome: tipologia.nome,
    categoria: tipologia.categoria,
    parametros: tipologia.parametros,
    pecas: tipologia.pecas.map((p, i) => {
      const perfil = mapaPerfil.get(p.perfilId);
      if (!perfil) throw new RespostaDeErro(400, `peça "${p.descricao}" aponta para um perfil inexistente`);
      return {
        id: `p${i}`,
        descricao: p.descricao,
        perfilId: perfil.id,
        perfilCodigo: perfil.codigo,
        perfilNome: perfil.nome,
        pesoPorMetro: perfil.pesoPorMetro,
        precoPorKgCentavos: perfil.precoPorKgCentavos,
        comprimentoBarraMm: perfil.comprimentoBarraMm,
        corte: p.corte,
        formulaQuantidade: p.formulaQuantidade,
        formulaComprimento: p.formulaComprimento,
      };
    }),
    vidros: tipologia.vidros.map((v, i) => {
      const vidro = mapaVidro.get(v.vidroId);
      if (!vidro) throw new RespostaDeErro(400, `vidro "${v.descricao}" não encontrado`);
      return {
        id: `v${i}`,
        descricao: v.descricao,
        vidroId: vidro.id,
        vidroNome: vidro.nome,
        precoM2Centavos: vidro.precoM2Centavos,
        m2Minimo: vidro.m2Minimo,
        formulaQuantidade: v.formulaQuantidade,
        formulaLargura: v.formulaLargura,
        formulaAltura: v.formulaAltura,
      };
    }),
    ferragens: tipologia.ferragens.map((f, i) => {
      const ferragem = mapaFerragem.get(f.ferragemId);
      if (!ferragem) throw new RespostaDeErro(400, `ferragem "${f.descricao}" não encontrada`);
      return {
        id: `f${i}`,
        descricao: f.descricao,
        ferragemId: ferragem.id,
        ferragemNome: ferragem.nome,
        unidade: ferragem.unidade,
        precoUnitarioCentavos: ferragem.precoUnitarioCentavos,
        fracionavel: ferragem.fracionavel,
        formulaQuantidade: f.formulaQuantidade,
      };
    }),
  };

  try {
    return ok({ expansao: expandirTipologia(motor, { larguraMm, alturaMm, quantidade }) });
  } catch (err) {
    throw new RespostaDeErro(400, err instanceof Error ? err.message : "não foi possível expandir a tipologia");
  }
});
