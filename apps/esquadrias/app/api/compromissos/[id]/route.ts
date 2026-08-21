import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirRecurso, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "AGENDA");

  const dados = await corpo(
    req,
    z.object({
      titulo: z.string().trim().min(2).max(160).optional(),
      concluido: z.boolean().optional(),
      inicio: z.string().datetime().optional(),
      fim: z.string().datetime().nullish(),
      responsavelId: z.string().trim().nullish(),
    }),
  );

  const { count } = await prisma.compromisso.updateMany({
    where: { id: params.id, empresaId: usuario.empresaId },
    data: {
      ...dados,
      inicio: dados.inicio ? new Date(dados.inicio) : undefined,
      fim: dados.fim ? new Date(dados.fim) : dados.fim,
    },
  });
  if (count === 0) throw new RespostaDeErro(404, "compromisso não encontrado");

  return ok({ ok: true });
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "AGENDA");

  const { count } = await prisma.compromisso.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "compromisso não encontrado");

  return ok({ ok: true });
});
