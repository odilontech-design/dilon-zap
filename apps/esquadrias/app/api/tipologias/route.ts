import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";
import { registrar } from "@/lib/auditoria";
import { schemaTipologia } from "@/lib/schemas";
import { conferirFormulas, conferirInsumos } from "@/lib/tipologias";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const categoria = new URL(req.url).searchParams.get("categoria");

  return ok(
    await prisma.tipologia.findMany({
      where: { empresaId: usuario.empresaId, ativa: true, ...(categoria ? { categoria: categoria as never } : {}) },
      include: {
        linha: { select: { nome: true } },
        parametros: { orderBy: { ordem: "asc" } },
        _count: { select: { pecas: true, vidros: true, ferragens: true } },
      },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaTipologia);

  conferirFormulas(dados);
  await conferirInsumos(dados, usuario.empresaId);

  const criada = await prisma.tipologia.create({
    data: {
      empresaId: usuario.empresaId,
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
  });

  await registrar(usuario, "tipologia.criada", { entidade: "Tipologia", entidadeId: criada.id, detalhe: { nome: criada.nome } });
  return ok(criada, 201);
});
