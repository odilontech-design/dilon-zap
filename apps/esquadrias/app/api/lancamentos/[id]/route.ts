import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, exigirRecurso, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

type Ctx = { params: { id: string } };

const schema = z.object({
  status: z.enum(["PENDENTE", "PAGO", "CANCELADO"]).optional(),
  formaPagamento: z.string().trim().max(40).nullish(),
  pagoEm: z.string().datetime().nullish(),
  valorCentavos: z.number().int().min(1).optional(),
  vencimento: z.string().datetime().optional(),
  descricao: z.string().trim().min(2).max(160).optional(),
});

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "FINANCEIRO");
  exigirPapel(usuario, ["OWNER", "GERENTE", "FINANCEIRO"]);

  const dados = await corpo(req, schema);

  const { count } = await prisma.lancamento.updateMany({
    where: { id: params.id, empresaId: usuario.empresaId },
    data: {
      ...dados,
      vencimento: dados.vencimento ? new Date(dados.vencimento) : undefined,
      // Baixar sem data explícita usa hoje, e quem baixou fica registrado:
      // "esse boleto foi dado como pago por quem?" é pergunta de auditoria
      // recorrente no financeiro.
      ...(dados.status === "PAGO"
        ? { pagoEm: dados.pagoEm ? new Date(dados.pagoEm) : new Date(), baixadoPorId: usuario.id }
        : {}),
      ...(dados.status === "PENDENTE" ? { pagoEm: null, baixadoPorId: null } : {}),
    },
  });
  if (count === 0) throw new RespostaDeErro(404, "lançamento não encontrado");

  if (dados.status) await registrar(usuario, `lancamento.${dados.status.toLowerCase()}`, { entidade: "Lancamento", entidadeId: params.id });

  return ok(await prisma.lancamento.findUnique({ where: { id: params.id } }));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "FINANCEIRO");
  exigirPapel(usuario, ["OWNER", "GERENTE", "FINANCEIRO"]);

  const { count } = await prisma.lancamento.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId, status: "PENDENTE" } });
  // Lançamento já pago não some: ele é a contrapartida de dinheiro que
  // entrou ou saiu, e apagar reescreveria o caixa de um mês fechado.
  if (count === 0) throw new RespostaDeErro(409, "lançamento não encontrado ou já baixado — cancele em vez de excluir");

  return ok({ ok: true });
});
