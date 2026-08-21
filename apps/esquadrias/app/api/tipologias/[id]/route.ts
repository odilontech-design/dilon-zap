import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { registrar } from "@/lib/auditoria";
import { schemaTipologia } from "@/lib/schemas";
import { conferirFormulas, conferirInsumos } from "@/lib/tipologias";

type Ctx = { params: { id: string } };

export const GET = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();

  const tipologia = await prisma.tipologia.findFirst({
    where: { id: params.id, empresaId: usuario.empresaId },
    include: {
      parametros: { orderBy: { ordem: "asc" } },
      pecas: { include: { perfil: true }, orderBy: { ordem: "asc" } },
      vidros: { include: { vidro: true }, orderBy: { ordem: "asc" } },
      ferragens: { include: { ferragem: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!tipologia) throw new RespostaDeErro(404, "tipologia não encontrada");

  return ok(tipologia);
});

/**
 * Substitui a tipologia inteira (PUT, não PATCH).
 *
 * As linhas filhas são apagadas e recriadas dentro de uma transação. É mais
 * simples e mais seguro do que casar id por id: o editor manda a lista final
 * de peças, e qualquer diff parcial correria o risco de deixar uma peça órfã
 * que continuaria entrando em todo orçamento sem ninguém ver.
 */
export const PUT = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaTipologia);

  const existente = await prisma.tipologia.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!existente) throw new RespostaDeErro(404, "tipologia não encontrada");

  conferirFormulas(dados);
  await conferirInsumos(dados, usuario.empresaId);

  await prisma.$transaction([
    prisma.parametroTipologia.deleteMany({ where: { tipologiaId: params.id } }),
    prisma.tipologiaPeca.deleteMany({ where: { tipologiaId: params.id } }),
    prisma.tipologiaVidro.deleteMany({ where: { tipologiaId: params.id } }),
    prisma.tipologiaFerragem.deleteMany({ where: { tipologiaId: params.id } }),
    prisma.tipologia.update({
      where: { id: params.id },
      data: {
        nome: dados.nome,
        categoria: dados.categoria,
        descricao: dados.descricao ?? null,
        linhaId: dados.linhaId || null,
        desenhoSvg: dados.desenhoSvg ?? null,
        larguraMinMm: dados.larguraMinMm,
        larguraMaxMm: dados.larguraMaxMm,
        alturaMinMm: dados.alturaMinMm,
        alturaMaxMm: dados.alturaMaxMm,
        parametros: { create: dados.parametros.map((p, i) => ({ ...p, ordem: i })) },
        pecas: { create: dados.pecas.map((p, i) => ({ ...p, ordem: i })) },
        vidros: { create: dados.vidros.map((v, i) => ({ ...v, ordem: i })) },
        ferragens: { create: dados.ferragens.map((f, i) => ({ ...f, ordem: i })) },
      },
    }),
  ]);

  await registrar(usuario, "tipologia.alterada", { entidade: "Tipologia", entidadeId: params.id, detalhe: { nome: dados.nome } });
  return ok({ ok: true });
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const emUso = await prisma.orcamentoItem.count({ where: { tipologiaId: params.id } });
  // Tipologia usada em orçamento é desativada, nunca apagada: o item guarda a
  // memória de cálculo, mas o nome e o desenho vêm daqui na hora de reimprimir.
  if (emUso > 0) {
    await prisma.tipologia.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: { ativa: false } });
    return ok({ ok: true, desativado: true, itens: emUso });
  }

  const { count } = await prisma.tipologia.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "tipologia não encontrada");

  return ok({ ok: true });
});
