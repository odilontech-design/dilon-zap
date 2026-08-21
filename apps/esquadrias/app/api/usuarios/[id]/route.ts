import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const dados = await corpo(
    req,
    z.object({
      nome: z.string().trim().min(2).max(120).optional(),
      papel: z.enum(["OWNER", "GERENTE", "VENDEDOR", "PRODUCAO", "FINANCEIRO"]).optional(),
      telefone: z.string().trim().max(40).nullish(),
      comissaoPercent: z.number().min(0).max(100).optional(),
      ativo: z.boolean().optional(),
      novaSenha: z.string().min(8).max(72).optional(),
    }),
  );

  const alvo = await prisma.usuario.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!alvo) throw new RespostaDeErro(404, "usuário não encontrado");

  // Ninguém se desativa nem se rebaixa: a empresa ficaria sem dono e sem
  // ninguém capaz de reverter.
  if (alvo.id === usuario.id && (dados.ativo === false || (dados.papel && dados.papel !== alvo.papel))) {
    throw new RespostaDeErro(409, "você não pode alterar o próprio acesso");
  }

  if (alvo.papel === "OWNER" && dados.papel && dados.papel !== "OWNER") {
    const outrosDonos = await prisma.usuario.count({
      where: { empresaId: usuario.empresaId, papel: "OWNER", desativadoEm: null, id: { not: alvo.id } },
    });
    if (outrosDonos === 0) throw new RespostaDeErro(409, "a empresa precisa de pelo menos um responsável");
  }

  await prisma.usuario.update({
    where: { id: params.id },
    data: {
      nome: dados.nome,
      papel: dados.papel,
      telefone: dados.telefone,
      comissaoPercent: dados.comissaoPercent,
      ...(dados.ativo === undefined ? {} : { desativadoEm: dados.ativo ? null : new Date() }),
      ...(dados.novaSenha ? { senhaHash: await bcrypt.hash(dados.novaSenha, 10) } : {}),
    },
  });

  await registrar(usuario, "usuario.alterado", { entidade: "Usuario", entidadeId: params.id, detalhe: { campos: Object.keys(dados) } });
  return ok({ ok: true });
});
