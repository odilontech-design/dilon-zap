import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { registrar } from "@/lib/auditoria";
import { schemaPerfil } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaPerfil.partial());

  const anterior = await prisma.perfil.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!anterior) throw new RespostaDeErro(404, "perfil não encontrado");

  const atualizado = await prisma.perfil.update({ where: { id: params.id }, data: dados });

  // Mudança de preço vai pra auditoria com o valor velho junto: "por que a
  // janela ficou 12% mais cara este mês" é a pergunta que essa linha responde.
  if (dados.precoPorKgCentavos && dados.precoPorKgCentavos !== anterior.precoPorKgCentavos) {
    await registrar(usuario, "perfil.preco_alterado", {
      entidade: "Perfil",
      entidadeId: params.id,
      detalhe: { codigo: anterior.codigo, de: anterior.precoPorKgCentavos, para: dados.precoPorKgCentavos },
    });
  }

  return ok(atualizado);
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const emUso = await prisma.tipologiaPeca.count({ where: { perfilId: params.id } });
  // Desativa em vez de apagar quando o perfil está em uso: apagar deixaria
  // tipologias apontando pro vazio e orçamentos antigos sem referência.
  if (emUso > 0) {
    await prisma.perfil.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: { ativo: false } });
    return ok({ ok: true, desativado: true, tipologias: emUso });
  }

  const { count } = await prisma.perfil.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "perfil não encontrado");

  return ok({ ok: true });
});
