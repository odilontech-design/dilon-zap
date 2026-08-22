import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, exigirRecurso, ok, rota, usuarioDaApi } from "@/lib/api";

/** Primeiro dia do mês em UTC — a competência é o mês, não o instante. */
function competenciaDe(texto: string): Date {
  const d = new Date(texto);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "METAS");

  const mes = new URL(req.url).searchParams.get("competencia");
  const competencia = competenciaDe(mes ?? new Date().toISOString());

  return ok(
    await prisma.metaVenda.findMany({
      where: { empresaId: usuario.empresaId, competencia },
      include: { usuario: { select: { id: true, nome: true } } },
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "METAS");
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const dados = await corpo(
    req,
    z.object({
      usuarioId: z.string().trim().min(1),
      competencia: z.string().datetime(),
      metaCentavos: z.number().int().min(0),
    }),
  );

  const competencia = competenciaDe(dados.competencia);

  return ok(
    await prisma.metaVenda.upsert({
      where: { usuarioId_competencia: { usuarioId: dados.usuarioId, competencia } },
      update: { metaCentavos: dados.metaCentavos },
      create: { empresaId: usuario.empresaId, usuarioId: dados.usuarioId, competencia, metaCentavos: dados.metaCentavos },
    }),
    201,
  );
});
